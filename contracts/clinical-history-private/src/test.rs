use super::*;
extern crate std;
use doctor_registry_private::{DoctorRegistryPrivate, DoctorRegistryPrivateClient};
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Events, Ledger, MockAuth, MockAuthInvoke},
    IntoVal,
};

struct Fixture {
    e: Env,
    registry: Address,
    id: Address,
    patient: Address,
    doctor: Address,
    other: Address,
    history: BytesN<32>,
}

impl Fixture {
    fn new() -> Self {
        let e = Env::default();
        e.mock_all_auths();
        e.ledger().with_mut(|l| {
            l.timestamp = 10;
            l.sequence_number = 100;
        });
        let admin = Address::generate(&e);
        let patient = Address::generate(&e);
        let doctor = Address::generate(&e);
        let other = Address::generate(&e);
        let registry = e.register(DoctorRegistryPrivate, (admin,));
        DoctorRegistryPrivateClient::new(&e, &registry).authorize_doctor(
            &doctor,
            &bytes(&e, 90),
            &1_000,
        );
        let id = e.register(ClinicalHistoryPrivate, (registry.clone(),));
        let history = ClinicalHistoryPrivateClient::new(&e, &id).derive_history_id(&patient);
        ClinicalHistoryPrivateClient::new(&e, &id).create_history(
            &patient,
            &history,
            &bytes(&e, 2),
        );
        Self {
            e,
            registry,
            id,
            patient,
            doctor,
            other,
            history,
        }
    }
    fn client(&self) -> ClinicalHistoryPrivateClient<'_> {
        ClinicalHistoryPrivateClient::new(&self.e, &self.id)
    }
    fn registry(&self) -> DoctorRegistryPrivateClient<'_> {
        DoctorRegistryPrivateClient::new(&self.e, &self.registry)
    }
    fn change(&self, read: bool, append: bool, revision: u64, op: u8) -> PermissionChange {
        PermissionChange {
            history_id: self.history.clone(),
            doctor: self.doctor.clone(),
            can_read: read,
            can_append: append,
            expected_revision: revision,
            operation_id: bytes(&self.e, op),
        }
    }
    fn record(&self, author: &Address, version: u32, revision: u64, op: u8) -> RecordInput {
        RecordInput {
            history_id: self.history.clone(),
            entry_id: self
                .client()
                .derive_entry_id(&self.history, author, &bytes(&self.e, op)),
            author: author.clone(),
            commitment: bytes(&self.e, op),
            expected_version: version,
            expected_grant_revision: revision,
            operation_id: bytes(&self.e, op),
        }
    }
}

fn bytes(e: &Env, b: u8) -> BytesN<32> {
    BytesN::from_array(e, &[b; 32])
}

#[test]
fn creation_is_unique_per_patient_and_history_with_exact_patient_signature() {
    let f = Fixture::new();
    let c = f.client();
    assert_eq!(c.interface_version(), 1);
    assert_eq!(c.get_registry(), f.registry);
    assert_eq!(c.get_history_for_patient(&f.patient).history_id, f.history);
    assert_eq!(
        c.try_create_history(&f.patient, &f.history, &bytes(&f.e, 11)),
        Err(Ok(Error::Exists))
    );
    assert_eq!(
        c.try_create_history(&f.other, &f.history, &bytes(&f.e, 11)),
        Err(Ok(Error::Invalid))
    );
    let id = c.derive_history_id(&f.other);
    let op = bytes(&f.e, 11);
    let args = (f.other.clone(), id.clone(), op.clone()).into_val(&f.e);
    f.e.mock_auths(&[]);
    assert!(c.try_create_history(&f.other, &id, &op).is_err());
    f.e.mock_auths(&[MockAuth {
        address: &f.patient,
        invoke: &MockAuthInvoke {
            contract: &f.id,
            fn_name: "create_history",
            args,
            sub_invokes: &[],
        },
    }]);
    assert!(c.try_create_history(&f.other, &id, &op).is_err());
    f.e.mock_auths(&[MockAuth {
        address: &f.other,
        invoke: &MockAuthInvoke {
            contract: &f.id,
            fn_name: "create_history",
            args: (f.other.clone(), id.clone(), op.clone()).into_val(&f.e),
            sub_invokes: &[],
        },
    }]);
    let history = c.create_history(&f.other, &id, &op);
    assert_eq!(history.patient, f.other);
    f.e.mock_all_auths();
    assert_eq!(c.create_history(&f.other, &id, &op), history);
    assert_eq!(
        c.try_create_history(&f.other, &bytes(&f.e, 12), &op),
        Err(Ok(Error::OperationConflict))
    );
}

#[test]
fn permissions_require_owner_exact_args_and_are_scoped_to_patient_and_doctor() {
    let f = Fixture::new();
    let c = f.client();
    let change = f.change(true, true, 0, 10);
    f.e.mock_auths(&[]);
    assert!(c.try_set_permissions(&change).is_err());
    f.e.mock_auths(&[MockAuth {
        address: &f.doctor,
        invoke: &MockAuthInvoke {
            contract: &f.id,
            fn_name: "set_permissions",
            args: (change.clone(),).into_val(&f.e),
            sub_invokes: &[],
        },
    }]);
    assert!(c.try_set_permissions(&change).is_err());
    f.e.mock_auths(&[MockAuth {
        address: &f.patient,
        invoke: &MockAuthInvoke {
            contract: &f.id,
            fn_name: "set_permissions",
            args: (change.clone(),).into_val(&f.e),
            sub_invokes: &[],
        },
    }]);
    let mut altered = change.clone();
    altered.doctor = f.other.clone();
    assert!(c.try_set_permissions(&altered).is_err());
    f.e.mock_auths(&[MockAuth {
        address: &f.patient,
        invoke: &MockAuthInvoke {
            contract: &f.id,
            fn_name: "set_permissions",
            args: (change.clone(),).into_val(&f.e),
            sub_invokes: &[],
        },
    }]);
    c.set_permissions(&change);
    assert!(c.can_read(&f.history, &f.doctor));
    assert!(!c.can_read(&f.history, &f.other));
    assert!(!c.can_read(&bytes(&f.e, 99), &f.doctor));
    f.e.mock_all_auths();
    let second = c.derive_history_id(&f.other);
    c.create_history(&f.other, &second, &bytes(&f.e, 13));
    assert!(!c.can_append(&second, &f.doctor));
    altered = f.change(true, true, 0, 14);
    altered.doctor = f.patient.clone();
    assert_eq!(c.try_set_permissions(&altered), Err(Ok(Error::Invalid)));
}

#[test]
fn read_and_append_are_independent_for_all_combinations() {
    let f = Fixture::new();
    let c = f.client();
    assert!(c.can_read(&f.history, &f.patient));
    assert!(c.can_append(&f.history, &f.patient));
    assert!(!c.can_read(&f.history, &f.doctor));
    for (index, (read, append)) in [(false, false), (true, false), (false, true), (true, true)]
        .into_iter()
        .enumerate()
    {
        c.set_permissions(&f.change(read, append, index as u64, 10 + index as u8));
        assert_eq!(c.can_read(&f.history, &f.doctor), read);
        assert_eq!(c.can_append(&f.history, &f.doctor), append);
        let input = f.record(&f.doctor, 0, index as u64 + 1, 20 + index as u8);
        if append {
            assert_eq!(c.append_version(&input).version, 1);
        } else {
            assert_eq!(
                c.try_append_version(&input),
                Err(Ok(Error::PermissionRequired))
            );
        }
    }
}

#[test]
fn registry_revocation_expiry_pause_and_reauthorization_gate_every_medical_access() {
    let f = Fixture::new();
    let c = f.client();
    let r = f.registry();
    c.set_permissions(&f.change(true, true, 0, 10));
    let input = f.record(&f.doctor, 0, 1, 11);
    r.pause();
    assert!(!c.can_read(&f.history, &f.doctor));
    assert!(!c.can_append(&f.history, &f.doctor));
    assert_eq!(c.try_append_version(&input), Err(Ok(Error::Unauthorized)));
    r.unpause();
    assert!(c.can_read(&f.history, &f.doctor));
    f.e.ledger().with_mut(|l| l.timestamp = 1_000);
    assert!(!c.can_read(&f.history, &f.doctor));
    assert_eq!(c.try_append_version(&input), Err(Ok(Error::Unauthorized)));
    r.reauthorize_doctor(&f.doctor, &bytes(&f.e, 91), &2_000);
    c.append_version(&input);
    r.revoke_doctor(&f.doctor);
    let mut correction = f.record(&f.doctor, 1, 1, 12);
    correction.entry_id = input.entry_id.clone();
    assert_eq!(
        c.try_append_version(&correction),
        Err(Ok(Error::Unauthorized))
    );
    assert!(!c.can_read(&f.history, &f.doctor));
    assert!(c.can_read(&f.history, &f.patient));
    assert_eq!(c.append_version(&input).version, 1); // historical receipt, not reauthorization
    assert_eq!(c.get_entry(&f.history, &input.entry_id).head_version, 1);
}

#[contract]
struct BrokenRegistry;
#[contractimpl]
impl BrokenRegistry {
    pub fn is_authorized(_e: Env, _wallet: Address) -> bool {
        panic!("unavailable")
    }
}

#[test]
fn registry_failure_fails_closed_but_does_not_block_patient_control() {
    let e = Env::default();
    e.mock_all_auths();
    let broken = e.register(BrokenRegistry, ());
    let id = e.register(ClinicalHistoryPrivate, (broken,));
    let c = ClinicalHistoryPrivateClient::new(&e, &id);
    let p = Address::generate(&e);
    let d = Address::generate(&e);
    let history = c.derive_history_id(&p);
    c.create_history(&p, &history, &bytes(&e, 2));
    c.set_permissions(&PermissionChange {
        history_id: history.clone(),
        doctor: d.clone(),
        can_read: true,
        can_append: true,
        expected_revision: 0,
        operation_id: bytes(&e, 3),
    });
    assert!(!c.can_read(&history, &d));
    assert!(!c.can_append(&history, &d));
    let mut input = RecordInput {
        history_id: history.clone(),
        entry_id: c.derive_entry_id(&history, &d, &bytes(&e, 6)),
        author: d,
        commitment: bytes(&e, 5),
        expected_version: 0,
        expected_grant_revision: 1,
        operation_id: bytes(&e, 6),
    };
    assert_eq!(c.try_append_version(&input), Err(Ok(Error::Unauthorized)));
    input.author = p.clone();
    input.entry_id = c.derive_entry_id(&history, &p, &input.operation_id);
    input.expected_grant_revision = 0;
    c.append_version(&input);
    assert!(c.can_read(&history, &p));
}

#[test]
fn revocation_tombstone_blocks_delayed_grants_and_old_writes_even_after_regrant() {
    let f = Fixture::new();
    let c = f.client();
    let original = f.change(true, true, 0, 10);
    c.set_permissions(&original);
    let delayed = f.record(&f.doctor, 0, 1, 20);
    c.set_permissions(&f.change(false, false, 1, 11));
    assert_eq!(c.get_grant(&f.history, &f.doctor).revision, 2);
    assert_eq!(
        c.try_append_version(&delayed),
        Err(Ok(Error::PermissionRequired))
    );
    assert_eq!(c.set_permissions(&original).revision, 1); // retry returns old receipt only
    assert_eq!(c.get_grant(&f.history, &f.doctor).revision, 2);
    assert!(!c.can_read(&f.history, &f.doctor));
    assert_eq!(
        c.try_set_permissions(&f.change(true, true, 0, 12)),
        Err(Ok(Error::RevisionConflict))
    );
    c.set_permissions(&f.change(true, true, 2, 13));
    assert_eq!(
        c.try_append_version(&delayed),
        Err(Ok(Error::RevisionConflict))
    );
    let mut fresh = delayed;
    fresh.expected_grant_revision = 3;
    c.append_version(&fresh);
    assert!(c.can_read(&f.history, &f.doctor));
}

#[test]
fn authors_can_only_correct_their_own_versions_and_conflicts_preserve_history() {
    let f = Fixture::new();
    let c = f.client();
    c.set_permissions(&f.change(true, true, 0, 10));
    let first = f.record(&f.patient, 0, 0, 11);
    let version1 = c.append_version(&first);
    assert_eq!(version1.previous_commitment, None);
    let mut unauthorized = f.record(&f.doctor, 1, 1, 12);
    unauthorized.entry_id = first.entry_id.clone();
    assert_eq!(
        c.try_append_version(&unauthorized),
        Err(Ok(Error::Unauthorized))
    );
    let mut second = f.record(&f.patient, 1, 0, 13);
    second.entry_id = first.entry_id.clone();
    let version2 = c.append_version(&second);
    assert_eq!(
        version2.previous_commitment,
        Some(version1.commitment.clone())
    );
    assert_eq!(c.get_version(&f.history, &first.entry_id, &1), version1);
    assert_eq!(c.get_version(&f.history, &first.entry_id, &2), version2);
    let mut stale = f.record(&f.patient, 1, 0, 14);
    stale.entry_id = first.entry_id.clone();
    assert_eq!(
        c.try_append_version(&stale),
        Err(Ok(Error::VersionConflict))
    );
    let mut medical = f.record(&f.doctor, 0, 1, 15);
    c.append_version(&medical);
    let mut impersonate = medical.clone();
    impersonate.author = f.patient.clone();
    impersonate.expected_grant_revision = 0;
    impersonate.expected_version = 1;
    impersonate.operation_id = bytes(&f.e, 16);
    assert_eq!(
        c.try_append_version(&impersonate),
        Err(Ok(Error::Unauthorized))
    );
    medical.expected_version = 1;
    medical.operation_id = bytes(&f.e, 17);
    medical.commitment = bytes(&f.e, 18);
    c.set_permissions(&f.change(true, false, 1, 19));
    assert_eq!(
        c.try_append_version(&medical),
        Err(Ok(Error::PermissionRequired))
    );
    assert_eq!(c.get_entry(&f.history, &medical.entry_id).head_version, 1);
}

#[test]
fn doctor_write_requires_exact_author_signature_and_binds_commitment_context() {
    let f = Fixture::new();
    let c = f.client();
    c.set_permissions(&f.change(true, true, 0, 10));
    let input = f.record(&f.doctor, 0, 1, 11);
    f.e.mock_auths(&[]);
    assert!(c.try_append_version(&input).is_err());
    f.e.mock_auths(&[MockAuth {
        address: &f.patient,
        invoke: &MockAuthInvoke {
            contract: &f.id,
            fn_name: "append_version",
            args: (input.clone(),).into_val(&f.e),
            sub_invokes: &[],
        },
    }]);
    assert!(c.try_append_version(&input).is_err());
    for altered_field in 0..5 {
        f.e.mock_auths(&[MockAuth {
            address: &f.doctor,
            invoke: &MockAuthInvoke {
                contract: &f.id,
                fn_name: "append_version",
                args: (input.clone(),).into_val(&f.e),
                sub_invokes: &[],
            },
        }]);
        let mut changed = input.clone();
        match altered_field {
            0 => changed.commitment = bytes(&f.e, 99),
            1 => changed.history_id = bytes(&f.e, 99),
            2 => changed.entry_id = bytes(&f.e, 99),
            3 => changed.expected_grant_revision = 2,
            _ => changed.author = f.other.clone(),
        }
        assert!(c.try_append_version(&changed).is_err());
    }
    f.e.mock_auths(&[MockAuth {
        address: &f.doctor,
        invoke: &MockAuthInvoke {
            contract: &f.id,
            fn_name: "append_version",
            args: (input.clone(),).into_val(&f.e),
            sub_invokes: &[],
        },
    }]);
    assert_eq!(c.append_version(&input).author, f.doctor);
    f.e.mock_auths(&[]);
    assert!(c.try_append_version(&input).is_err()); // receipt replay does not bypass signature
}

#[test]
fn identical_retries_return_receipt_without_duplicate_versions_or_events() {
    let f = Fixture::new();
    let c = f.client();
    let input = f.record(&f.patient, 0, 0, 10);
    let original = c.append_version(&input);
    assert_eq!(f.e.events().all().len(), 1);
    f.e.ledger().with_mut(|l| l.timestamp = 20);
    assert_eq!(c.append_version(&input), original);
    assert_eq!(f.e.events().all().len(), 0);
    assert_eq!(c.get_entry(&f.history, &input.entry_id).head_version, 1);
    assert_eq!(
        c.get_operation(&f.patient, &input.operation_id).outcome,
        Outcome::Version(original)
    );
    let mut changed = input.clone();
    changed.commitment = bytes(&f.e, 11);
    assert_eq!(
        c.try_append_version(&changed),
        Err(Ok(Error::OperationConflict))
    );
    let mut change = f.change(true, true, 0, 10);
    assert_eq!(
        c.try_set_permissions(&change),
        Err(Ok(Error::OperationConflict))
    );
    change.operation_id = bytes(&f.e, 12);
    c.set_permissions(&change);
    change.can_read = false;
    assert_eq!(
        c.try_set_permissions(&change),
        Err(Ok(Error::OperationConflict))
    );
}

#[test]
fn zero_ids_and_commitments_and_unknown_metadata_are_rejected() {
    let f = Fixture::new();
    let c = f.client();
    let zero = bytes(&f.e, 0);
    assert_eq!(
        c.try_create_history(&f.other, &zero, &bytes(&f.e, 10)),
        Err(Ok(Error::Invalid))
    );
    assert_eq!(
        c.try_create_history(&f.other, &bytes(&f.e, 10), &zero),
        Err(Ok(Error::Invalid))
    );
    for field in 0..3 {
        let mut input = f.record(&f.patient, 0, 0, 10);
        match field {
            0 => input.entry_id = zero.clone(),
            1 => input.commitment = zero.clone(),
            _ => input.operation_id = zero.clone(),
        }
        assert_eq!(c.try_append_version(&input), Err(Ok(Error::Invalid)));
    }
    assert_eq!(c.try_get_history(&bytes(&f.e, 80)), Err(Ok(Error::Missing)));
    assert_eq!(
        c.try_get_grant(&f.history, &f.doctor),
        Err(Ok(Error::Missing))
    );
    assert_eq!(
        c.try_get_entry(&f.history, &bytes(&f.e, 80)),
        Err(Ok(Error::Missing))
    );
    assert_eq!(
        c.try_get_operation(&f.patient, &bytes(&f.e, 80)),
        Err(Ok(Error::Missing))
    );
    let invalid_patient = f.record(&f.patient, 0, 1, 10);
    assert_eq!(
        c.try_append_version(&invalid_patient),
        Err(Ok(Error::Invalid))
    );
}

#[test]
fn ttl_extension_keeps_tombstones_versions_and_operation_receipts() {
    let f = Fixture::new();
    let c = f.client();
    c.set_permissions(&f.change(true, true, 0, 10));
    c.set_permissions(&f.change(false, false, 1, 11));
    let input = f.record(&f.patient, 0, 0, 12);
    c.append_version(&input);
    let key = Key::Grant(f.history.clone(), f.doctor.clone());
    let before =
        f.e.as_contract(&f.id, || f.e.storage().persistent().get_ttl(&key));
    assert_eq!(before, TTL_EXTEND_TO);
    f.e.ledger()
        .with_mut(|l| l.sequence_number += TTL_EXTEND_TO - 100);
    let grant = c.get_grant(&f.history, &f.doctor);
    assert_eq!(
        grant,
        Grant {
            can_read: false,
            can_append: false,
            revision: 2
        }
    );
    assert_eq!(
        f.e.as_contract(&f.id, || f.e.storage().persistent().get_ttl(&key)),
        TTL_EXTEND_TO
    );
    assert_eq!(
        c.get_version(&f.history, &input.entry_id, &1).commitment,
        input.commitment
    );
    assert!(matches!(
        c.get_operation(&f.patient, &input.operation_id).outcome,
        Outcome::Version(_)
    ));
    assert_eq!(
        c.try_set_permissions(&f.change(true, true, 0, 13)),
        Err(Ok(Error::RevisionConflict))
    );
}

#[test]
fn inconsistent_missing_history_index_fails_closed_instead_of_reassigning_owner() {
    let f = Fixture::new();
    let c = f.client();
    f.e.as_contract(&f.id, || {
        f.e.storage()
            .persistent()
            .remove(&Key::Patient(f.patient.clone()))
    });
    assert_eq!(c.try_get_history(&f.history), Err(Ok(Error::CorruptState)));
    assert!(!c.can_read(&f.history, &f.patient));
    assert_eq!(
        c.try_append_version(&f.record(&f.patient, 0, 0, 10)),
        Err(Ok(Error::CorruptState))
    );
    assert_eq!(
        c.try_create_history(&f.other, &f.history, &bytes(&f.e, 11)),
        Err(Ok(Error::Invalid))
    );
}

#[test]
fn operation_ids_are_scoped_to_signer_and_cannot_be_consumed_by_other_patients() {
    let f = Fixture::new();
    let c = f.client();
    let shared_op = bytes(&f.e, 10);
    c.create_history(&f.other, &c.derive_history_id(&f.other), &shared_op);
    c.set_permissions(&f.change(true, true, 0, 10));
    assert!(c.can_append(&f.history, &f.doctor));
    assert!(matches!(
        c.get_operation(&f.other, &shared_op).outcome,
        Outcome::History(_)
    ));
    assert!(matches!(
        c.get_operation(&f.patient, &shared_op).outcome,
        Outcome::Permissions(_)
    ));
    let medical = f.record(&f.doctor, 0, 1, 10);
    c.append_version(&medical);
    assert!(matches!(
        c.get_operation(&f.doctor, &shared_op).outcome,
        Outcome::Version(_)
    ));
    // One actor must still not reuse their receipt for another method or context.
    let own = f.record(&f.patient, 0, 0, 10);
    assert_eq!(
        c.try_append_version(&own),
        Err(Ok(Error::OperationConflict))
    );
    let mut changed = medical;
    changed.entry_id = bytes(&f.e, 12);
    assert_eq!(
        c.try_append_version(&changed),
        Err(Ok(Error::OperationConflict))
    );
}

#[test]
fn archived_persistent_state_fails_closed_and_cannot_reset_revisions() {
    let f = Fixture::new();
    let c = f.client();
    c.set_permissions(&f.change(true, true, 0, 10));
    c.set_permissions(&f.change(false, false, 1, 11));
    // Keep only the contract instance and history indexes live, so the test
    // specifically encounters an archived grant rather than an absent instance.
    f.e.as_contract(&f.id, || {
        f.e.storage()
            .instance()
            .extend_ttl(TTL_EXTEND_TO * 2, TTL_EXTEND_TO * 2);
        for key in [
            Key::History(f.history.clone()),
            Key::Patient(f.patient.clone()),
        ] {
            f.e.storage()
                .persistent()
                .extend_ttl(&key, TTL_EXTEND_TO * 2, TTL_EXTEND_TO * 2);
        }
    });
    f.e.ledger()
        .with_mut(|l| l.sequence_number += TTL_EXTEND_TO + 1);
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(
        || c.try_get_grant(&f.history, &f.doctor)
    ))
    .is_err());
    // Soroban aborts when an archived persistent key is in the footprint; it
    // does not expose that key as None or allow the zero-revision branch.
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(
        || c.try_set_permissions(&f.change(true, true, 0, 12))
    ))
    .is_err());
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(
        || c.try_set_permissions(&f.change(true, true, 2, 13))
    ))
    .is_err());
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(
        || c.try_get_operation(&f.patient, &bytes(&f.e, 11))
    ))
    .is_err());
    assert_eq!(c.get_history(&f.history).patient, f.patient);
    // Actual RestoreFootprint and its receipt are a separate Testnet check.
}
