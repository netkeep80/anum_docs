use amemory_optimized_cpu_probe::{
    structural::{
        export_direct_recursive_wire_from,
        read_exact_sequence,
        OptimizedStructuralEngine,
    },
    OptimizedLinkStore,
};
use std::{collections::BTreeSet, env, fs, process};

const SCHEMA: &str = "MTS_V015_P2D_DEPENDENCY_FIXED_POINT_V1";

struct Package {
    links: Vec<String>,
    interpreter: String,
    initial: String,
    reversed_initial: String,
    expected_certs: String,
    absent_certs: String,
    valid_left_probe: String,
}

struct RunEvidence {
    generations: usize,
    final_scope: BTreeSet<String>,
}

fn parse(input: &str) -> Result<Package, String> {
    let mut lines = input.lines();
    if lines.next() != Some(SCHEMA) {
        return Err("unsupported transport schema".to_owned());
    }
    let link_count: usize = lines
        .next()
        .ok_or_else(|| "missing link count".to_owned())?
        .parse()
        .map_err(|_| "invalid link count".to_owned())?;

    let mut links = Vec::with_capacity(link_count);
    for _ in 0..link_count {
        links.push(
            lines
                .next()
                .ok_or_else(|| "missing link wire".to_owned())?
                .to_owned(),
        );
    }

    let take = |lines: &mut std::str::Lines<'_>, name: &str| -> Result<String, String> {
        lines
            .next()
            .map(str::to_owned)
            .ok_or_else(|| format!("missing {name}"))
    };

    let package = Package {
        links,
        interpreter: take(&mut lines, "interpreter")?,
        initial: take(&mut lines, "initial")?,
        reversed_initial: take(&mut lines, "reversed initial")?,
        expected_certs: take(&mut lines, "expected certs")?,
        absent_certs: take(&mut lines, "absent certs")?,
        valid_left_probe: take(&mut lines, "valid-left probe")?,
    };

    if lines.next().is_some() {
        return Err("trailing transport lines".to_owned());
    }
    Ok(package)
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
    package: &Package,
    initial_source: &str,
) -> Result<RunEvidence, String> {
    let mut store = OptimizedLinkStore::new();

    for source in &package.links {
        import_wire(&mut store, source)?;
    }

    let interpreter = import_wire(&mut store, &package.interpreter)?;
    let initial = import_sequence(&mut store, initial_source)?;
    let expected = import_sequence(&mut store, &package.expected_certs)?;
    let absent = import_sequence(&mut store, &package.absent_certs)?;
    let valid_left_probe =
        import_wire(&mut store, &package.valid_left_probe)?;

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

    let mut generations = 0usize;
    let mut reached_quiescence = false;

    for generation in 1usize..=64 {
        let reaction = engine
            .run(&mut store)
            .map_err(|error| format!("generation {generation} failed: {error:?}"))?;
        generations = generation;

        let current = engine.current();
        let has_leaf_cert = current.contains(&leaf_cert);
        let has_valid_left = current.contains(&valid_left_probe);

        // Exact generation-isolation witness on frozen 0.175.0:
        // G1 creates VALID(leaf); G2 creates Gate(leaf), but complete discovery
        // already happened from the old Scope. Therefore Gate(leaf) may affect
        // left only in G3.
        if generation == 1 && (has_leaf_cert || has_valid_left) {
            return Err(
                "G1 unexpectedly contains certificate or VALID(left)"
                    .to_owned(),
            );
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

        if reaction.quiescent {
            reached_quiescence = true;
            break;
        }
    }

    if !reached_quiescence {
        return Err(
            "dependency closure did not quiesce within 64 generations"
                .to_owned(),
        );
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

    Ok(RunEvidence {
        generations,
        final_scope: current_wires(&store, &engine)?,
    })
}

fn run(input: &str) -> Result<String, String> {
    let package = parse(input)?;
    let forward = execute(&package, &package.initial)?;
    let reverse = execute(&package, &package.reversed_initial)?;

    if forward.final_scope != reverse.final_scope {
        return Err("entry order changed final fixed point".to_owned());
    }

    Ok(format!(
        "FROZEN_AMEMORY_P2D_DEPENDENCY_FIXED_POINT=PASS \
         forward_generations={} reverse_generations={} \
         expected_certs=6 absent_cycle_certs=2 \
         generation_isolation=G2_GATE_NOT_VISIBLE_G3_VISIBLE \
         entry_order_semantic=0 host_dfs=0 host_visited=0 j1=0 \
         frozen_sha=832daa89f15fd0f3b7b40819b6d3670c7fd57e7d",
        forward.generations,
        reverse.generations,
    ))
}

fn main() {
    let Some(path) = env::args().nth(1) else {
        eprintln!("usage: p2d_dependency_fixed_point <transport.txt>");
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
        Ok(evidence) => println!("{evidence}"),
        Err(error) => {
            eprintln!("{error}");
            process::exit(1);
        }
    }
}
