use amemory_optimized_cpu_probe::{
    structural::{
        export_direct_recursive_wire_from,
        read_exact_sequence,
        OptimizedStructuralEngine,
    },
    OptimizedLinkStore,
};
use serde_json::{json, Value};
use std::{collections::BTreeSet, env, fs, process};

const SCHEMA: &str = "mts-v015-p2d-dependency-fixed-point-package/v0.1";

fn field<'a>(root: &'a Value, name: &str) -> Result<&'a str, String> {
    root.get(name)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("missing string field: {name}"))
}

fn import_wire(store: &mut OptimizedLinkStore, source: &str) -> Result<u32, String> {
    store
        .import_anum(source)
        .map_err(|error| format!("invalid recursive wire: {error:?}"))
}

fn import_sequence(
    store: &mut OptimizedLinkStore,
    source: &str,
) -> Result<Vec<u32>, String> {
    let sequence = import_wire(store, source)?;
    read_exact_sequence(store, sequence)
        .map_err(|error| format!("invalid ExactSequence: {error:?}"))
}

fn current_wires(
    store: &OptimizedLinkStore,
    engine: &OptimizedStructuralEngine,
) -> Result<BTreeSet<String>, String> {
    engine
        .current()
        .iter()
        .map(|handle| {
            export_direct_recursive_wire_from(store, *handle)
                .map_err(|error| format!("cannot export current: {error:?}"))
        })
        .collect()
}

fn execute(
    package: &Value,
    initial_field: &str,
) -> Result<Value, String> {
    let mut store = OptimizedLinkStore::new();

    let links = package
        .get("links")
        .and_then(Value::as_array)
        .ok_or_else(|| "missing links".to_owned())?;
    for source in links {
        let source = source
            .as_str()
            .ok_or_else(|| "links must contain strings".to_owned())?;
        import_wire(&mut store, source)?;
    }

    let interpreter = import_wire(&mut store, field(package, "interpreter")?)?;
    let initial = import_sequence(&mut store, field(package, initial_field)?)?;
    let expected = import_sequence(&mut store, field(package, "expectedCerts")?)?;
    let absent = import_sequence(&mut store, field(package, "absentCerts")?)?;
    let valid_left_probe =
        import_wire(&mut store, field(package, "validLeftProbe")?)?;

    if expected.len() != 6 || absent.len() != 2 || initial.len() != 8 {
        return Err("unexpected fixture cardinality".to_owned());
    }

    let leaf_cert = expected[0];

    let mut engine = OptimizedStructuralEngine::new(128);
    engine
        .set_interpreter(&store, interpreter)
        .map_err(|error| format!("interpreter rejected: {error:?}"))?;
    engine
        .set_current(&store, &initial)
        .map_err(|error| format!("initial Scope rejected: {error:?}"))?;

    let mut reactions = Vec::new();
    let mut reached_quiescence = false;

    for generation in 1usize..=64 {
        let reaction = engine
            .run(&mut store)
            .map_err(|error| format!("generation {generation} failed: {error:?}"))?;

        let current = engine.current();
        let has_leaf_cert = current.contains(&leaf_cert);
        let has_valid_left = current.contains(&valid_left_probe);

        // Generation-isolation witness:
        // G1 creates VALID(leaf), G2 creates Gate(leaf). The gate must not
        // advance left in G2; only G3 may expose VALID(left).
        if generation == 1 {
            if has_leaf_cert || has_valid_left {
                return Err(
                    "G1 unexpectedly contains certificate or VALID(left)"
                        .to_owned(),
                );
            }
        }
        if generation == 2 {
            if !has_leaf_cert {
                return Err("G2 did not publish leaf certificate".to_owned());
            }
            if has_valid_left {
                return Err(
                    "generated Gate became executable in its creation generation"
                        .to_owned(),
                );
            }
        }
        if generation == 3 && !has_valid_left {
            return Err(
                "G3 did not execute the Gate generated in G2".to_owned(),
            );
        }

        reactions.push(json!({
            "generation": generation,
            "raw_rule_matches": reaction.raw_rule_matches,
            "transitioned_members": reaction.transitioned_members,
            "quiescent": reaction.quiescent,
            "handoff_count": reaction.handoff_count,
            "scope_size": engine.current().len(),
        }));

        if reaction.quiescent {
            reached_quiescence = true;
            break;
        }
    }

    if !reached_quiescence {
        return Err("dependency closure did not quiesce within 64 generations".to_owned());
    }

    let current = engine.current();
    for certificate in &expected {
        if !current.contains(certificate) {
            return Err(format!(
                "expected positive certificate absent: {}",
                export_direct_recursive_wire_from(&store, *certificate)
                    .map_err(|error| format!("export failed: {error:?}"))?
            ));
        }
    }
    for certificate in &absent {
        if current.contains(certificate) {
            return Err(format!(
                "base-less cycle produced forbidden certificate: {}",
                export_direct_recursive_wire_from(&store, *certificate)
                    .map_err(|error| format!("export failed: {error:?}"))?
            ));
        }
    }

    Ok(json!({
        "generations": reactions.len(),
        "reactions": reactions,
        "final_scope": current_wires(&store, &engine)?,
        "expected_certificate_count": expected.len(),
        "absent_cycle_certificate_count": absent.len(),
        "generation_isolation": {
            "g2_leaf_certificate": true,
            "g2_valid_left": false,
            "g3_valid_left": true,
        },
    }))
}

fn run(input: &str) -> Result<Value, String> {
    let package: Value =
        serde_json::from_str(input).map_err(|error| format!("invalid package JSON: {error}"))?;
    if field(&package, "schema")? != SCHEMA {
        return Err("unsupported schema".to_owned());
    }

    let forward = execute(&package, "initial")?;
    let reverse = execute(&package, "reversedInitial")?;

    let forward_scope = forward
        .get("final_scope")
        .ok_or_else(|| "forward final_scope missing".to_owned())?;
    let reverse_scope = reverse
        .get("final_scope")
        .ok_or_else(|| "reverse final_scope missing".to_owned())?;
    if forward_scope != reverse_scope {
        return Err("entry order changed final fixed point".to_owned());
    }

    Ok(json!({
        "schema": "mts-v015-p2d-dependency-fixed-point-evidence/v0.1",
        "forward": forward,
        "reverse": reverse,
        "entry_order_semantic": false,
    }))
}

fn main() {
    let Some(path) = env::args().nth(1) else {
        eprintln!("usage: p2d_dependency_fixed_point <package.json>");
        process::exit(2);
    };
    let input = match fs::read_to_string(&path) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("cannot read {path}: {error}");
            process::exit(2);
        }
    };

    match run(&input) {
        Ok(evidence) => println!("{}", serde_json::to_string(&evidence).unwrap()),
        Err(error) => {
            eprintln!("{error}");
            process::exit(1);
        }
    }
}
