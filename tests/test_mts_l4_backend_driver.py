"""Executable challenge for the language-neutral L4 backend driver protocol."""

from copy import deepcopy
import json
from pathlib import Path

from converters.l4_backend_driver import (
    PROTOCOL_SCHEMA,
    ReferenceL4BackendDriver,
    canonical_wire_json,
    compile_l3_fixture,
)


ROOT = Path(__file__).parents[1]
PROTOCOL = ROOT / "contracts" / "mts-l4-backend-driver-v0.3.json"
DRIVER_CORPUS = ROOT / "contracts" / "mts-l4-backend-driver-conformance-v0.3.json"
SOURCE_CORPUS = ROOT / "contracts" / "mts-l4-backend-conformance-v0.3.json"
BACKEND_CHALLENGE = ROOT / "contracts" / "mts-l4-backend-challenge-v0.3.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def request(driver: ReferenceL4BackendDriver, counter: list[int], op: str, args: dict | None = None) -> tuple[dict, dict]:
    current = {"id": f"r{counter[0]}", "op": op}
    counter[0] += 1
    if args is not None:
        current["args"] = args
    return current, driver.dispatch(current)


def create_driver(assignment: dict[str, int]) -> tuple[ReferenceL4BackendDriver, list[dict]]:
    driver = ReferenceL4BackendDriver(assignment)
    sent: list[dict] = []
    req = {
        "id": "create",
        "op": "create",
        "args": {"seedGraph": {"links": read(SOURCE_CORPUS)["seedGraph"]["links"]}},
    }
    sent.append(deepcopy(req))
    assert driver.dispatch(req) == {"id": "create", "ok": True, "result": {"created": True}}
    return driver, sent


def normalized_snapshot_pairs(expectation: object) -> list[tuple[str, str]]:
    if not isinstance(expectation, list):
        return []
    if len(expectation) == 2 and all(isinstance(item, str) for item in expectation):
        return [(expectation[0], expectation[1])]
    pairs: list[tuple[str, str]] = []
    for item in expectation:
        assert isinstance(item, list) and len(item) == 2
        left, right = item
        assert isinstance(left, str) and isinstance(right, str)
        pairs.append((left, right))
    return pairs


def run_core_scenario(scenario: dict, assignment: dict[str, int]) -> dict:
    driver, sent = create_driver(assignment)
    counter = [0]
    snapshots: dict[str, dict] = {}
    observations: list[dict] = []
    compiled_denotation = None
    node_bindings = None
    if "denotation" in scenario:
        fixture = scenario["denotation"]
        compiled_denotation = compile_l3_fixture(
            fixture["sourceRaw"],
            fixture["context"],
        )
        node_bindings = {
            str(node["id"]): f"@{scenario['id']}:node:{node['id']}"
            for node in compiled_denotation["nodes"]
        }

    for operation in scenario["operations"]:
        op = operation["op"]
        args: dict | None
        if op == "snapshot":
            args = None
        elif op == "find_link":
            args = {"start": operation["start"], "end": operation["end"]}
        elif op in {"poles", "outgoing", "incoming", "delete_link"}:
            args = {"ref": operation["ref"]}
        elif op == "realize_link":
            bind = operation.get("bind") or operation.get("expectBinding")
            assert isinstance(bind, str)
            args = {
                "start": operation["start"],
                "end": operation["end"],
                "bind": bind,
            }
        elif op == "realize_structural_denotation":
            assert compiled_denotation is not None and node_bindings is not None
            bind = operation.get("bind") or operation.get("expectBinding")
            assert isinstance(bind, str)
            args = {
                "denotation": deepcopy(compiled_denotation),
                "anchors": deepcopy(operation["anchors"]),
                "nodeBindings": deepcopy(node_bindings),
                "bind": bind,
            }
        else:
            raise AssertionError(f"unsupported #130 core op in driver runner: {op}")

        req, response = request(driver, counter, op, args)
        sent.append(deepcopy(req))
        observations.append(deepcopy(response))

        expected_error = operation.get("expectError")
        if expected_error is not None:
            assert response == {
                "id": req["id"],
                "ok": False,
                "error": {"code": expected_error},
            }
            continue

        assert response["ok"] is True, (scenario["id"], operation, response)
        result = response["result"]
        if op == "snapshot":
            snapshots[operation["bind"]] = deepcopy(result)
        if "expect" in operation:
            if op == "find_link":
                assert result["ref"] == operation["expect"]
            elif op == "poles":
                assert result["poles"] == operation["expect"]
            else:
                raise AssertionError(f"unexpected scalar expectation for {op}")
        if "expectBinding" in operation:
            assert result["ref"] == operation["expectBinding"]
        if "expectSet" in operation:
            assert result["refs"] == sorted(operation["expectSet"])
        if "bind" in operation and op in {"realize_link", "realize_structural_denotation"}:
            assert result["ref"] == operation["bind"]

    expectation = scenario.get("expect", {})
    for left, right in normalized_snapshot_pairs(expectation.get("snapshotsEqual")):
        assert snapshots[left] == snapshots[right], scenario["id"]

    return {
        "scenario": scenario["id"],
        "observations": observations,
        "snapshots": snapshots,
        "sent": sent,
        # Test-only inspection proves native values actually differ while the
        # wire/observations above never expose them.
        "nativeBindings": dict(driver._bindings),
    }


def test_protocol_is_non_normative_and_preserves_backend_challenge_boundary():
    protocol = read(PROTOCOL)
    challenge = read(BACKEND_CHALLENGE)
    corpus = read(DRIVER_CORPUS)

    assert protocol["schema"] == PROTOCOL_SCHEMA
    assert protocol["status"] == "candidate-challenge"
    assert protocol["issue"] == 141
    assert protocol["parentIssue"] == 124
    assert protocol["acceptedContractLinkAllowed"] is False
    assert protocol["productionBackendContractAccepted"] is False
    assert challenge["status"] == "candidate-challenge"
    assert corpus["status"] == "candidate-challenge-corpus"
    assert corpus["sourceCorpus"] == "contracts/mts-l4-backend-conformance-v0.3.json"
    assert protocol["architecture"]["driverParsesRawAnum"] is False
    assert protocol["architecture"]["driverRunsL2Interpreter"] is False


def test_protocol_vectors_have_exact_normalized_reference_responses():
    driver = ReferenceL4BackendDriver()
    for vector in read(DRIVER_CORPUS)["protocolVectors"]:
        assert driver.dispatch(vector["request"]) == vector["expect"], vector["id"]


def test_every_source_core_scenario_is_selected_exactly_once_for_driver_replay():
    source_ids = [item["id"] for item in read(SOURCE_CORPUS)["scenarios"]]
    driver_ids = read(DRIVER_CORPUS)["coreReplay"]["scenarioIds"]

    assert driver_ids == source_ids
    assert len(driver_ids) == len(set(driver_ids)) == 6


def test_all_six_core_scenarios_replay_through_driver_under_both_handle_assignments():
    source = read(SOURCE_CORPUS)
    scenarios = {item["id"]: item for item in source["scenarios"]}
    assignments = read(DRIVER_CORPUS)["referenceAssignments"]

    runs: dict[str, list[dict]] = {}
    for scenario_id in read(DRIVER_CORPUS)["coreReplay"]["scenarioIds"]:
        runs[scenario_id] = [
            run_core_scenario(scenarios[scenario_id], assignment)
            for assignment in assignments
        ]
        # Remove the private/native evidence before comparing portable results.
        left = {key: value for key, value in runs[scenario_id][0].items() if key != "nativeBindings"}
        right = {key: value for key, value in runs[scenario_id][1].items() if key != "nativeBindings"}
        assert left == right, scenario_id

    pair_refs = [runs["realize-exact-pair"][index]["nativeBindings"]["pair"] for index in (0, 1)]
    assert pair_refs[0] != pair_refs[1]


def test_structural_fixture_is_compiled_before_driver_wire_and_never_sends_raw_context():
    source = read(SOURCE_CORPUS)
    scenario = next(item for item in source["scenarios"] if item["id"] == "structural-denotation-atomicity")
    run = run_core_scenario(scenario, read(DRIVER_CORPUS)["referenceAssignments"][0])

    structural_requests = [
        item for item in run["sent"] if item["op"] == "realize_structural_denotation"
    ]
    assert len(structural_requests) == 3
    for item in structural_requests:
        data = item["args"]["denotation"]
        assert data["kind"] == "structural"
        assert set(data) == {"kind", "anchors", "nodes", "root"}
        wire = canonical_wire_json(item)
        assert "sourceRaw" not in wire
        assert "ProjectionContext" not in wire
        assert '"context"' not in wire

    fixture_contract = read(DRIVER_CORPUS)["fixtureCompilation"]
    assert fixture_contract["sourceRaw"] == scenario["denotation"]["sourceRaw"]
    assert fixture_contract["sourceContext"] == scenario["denotation"]["context"]
    assert set(fixture_contract["driverRequestMustContain"]) == {"kind", "anchors", "nodes", "root"}


def test_normalized_snapshots_and_responses_contain_no_native_handle_values():
    source = read(SOURCE_CORPUS)
    assignment = read(DRIVER_CORPUS)["referenceAssignments"][1]
    native_values = set(assignment.values())

    for scenario in source["scenarios"]:
        run = run_core_scenario(scenario, assignment)
        portable_json = canonical_wire_json(
            {
                "observations": run["observations"],
                "snapshots": run["snapshots"],
            }
        )
        for value in native_values:
            assert f'":{value}' not in portable_json
            assert f'[{value}' not in portable_json

    protocol = read(PROTOCOL)
    assert protocol["wire"]["backendHandleMayAppear"] is False
    assert protocol["wire"]["physicalAddressMayAppear"] is False


def test_find_and_error_paths_keep_normalized_snapshots_unchanged():
    source = {item["id"]: item for item in read(SOURCE_CORPUS)["scenarios"]}
    assignment = read(DRIVER_CORPUS)["referenceAssignments"][0]

    read_run = run_core_scenario(source["read-missing-pair"], assignment)
    assert read_run["snapshots"]["before"] == read_run["snapshots"]["after"]

    delete_run = run_core_scenario(source["delete-safety"], assignment)
    assert delete_run["snapshots"]["beforeRejectedDelete"] == delete_run["snapshots"]["afterRejectedDelete"]

    structural = run_core_scenario(source["structural-denotation-atomicity"], assignment)
    assert structural["snapshots"]["beforeMissingAnchor"] == structural["snapshots"]["afterMissingAnchor"]
    assert structural["snapshots"]["afterFirstRealize"] == structural["snapshots"]["afterSecondRealize"]


def test_reference_driver_declares_persistence_vectors_unsupported_not_passed():
    hello = ReferenceL4BackendDriver().dispatch({"id": "h", "op": "hello"})
    capabilities = hello["result"]["capabilities"]
    persistent = read(SOURCE_CORPUS)["persistentOnlyScenarios"]
    gate = read(DRIVER_CORPUS)["capabilityVectors"]

    assert capabilities["persistence"] is False
    assert capabilities["crash-recovery"] is False
    assert gate["unsupportedIsNotSemanticPass"] is True
    assert {item["id"] for item in persistent} == set(gate["referenceUnsupportedPersistentScenarios"])
    assert set(gate["futurePersistentDriverMustRun"]) == {
        "clean-reopen",
        "realize-after-reopen",
        "index-consistency-after-reopen",
    }
    assert gate["futureCrashRecoveryDriverMustRun"] == ["interrupted-atomic-commit"]


def test_driver_binding_conflict_cannot_turn_adapter_metadata_into_backend_mutation():
    assignment = read(DRIVER_CORPUS)["referenceAssignments"][0]
    driver, _sent = create_driver(assignment)
    counter = [0]

    # First bind one exact pair to a stable scenario name.
    _req, first = request(
        driver,
        counter,
        "realize_link",
        {"start": "zero", "end": "one", "bind": "pair"},
    )
    assert first["ok"] is True
    before_req, before = request(driver, counter, "snapshot")
    assert before["ok"] is True

    # Reusing that name for a different pair must fail without changing store.
    _req, rejected = request(
        driver,
        counter,
        "realize_link",
        {"start": "root", "end": "zero", "bind": "pair"},
    )
    assert rejected["ok"] is False
    assert rejected["error"]["code"] == "binding-conflict"
    after_req, after = request(driver, counter, "snapshot")
    assert before_req["op"] == after_req["op"] == "snapshot"
    assert before["result"] == after["result"]
