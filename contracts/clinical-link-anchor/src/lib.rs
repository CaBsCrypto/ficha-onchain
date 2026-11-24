#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, symbol_short, Address, BytesN, Env};

const TTL_THRESHOLD: u32 = 17_280;
const TTL_LEDGERS: u32 = 518_400;

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    InvalidCommitment = 1,
}

#[contract]
pub struct ClinicalLinkAnchor;

#[contractimpl]
impl ClinicalLinkAnchor {
    pub fn __constructor(env: Env, publisher: Address) {
        env.storage()
            .instance()
            .set(&symbol_short!("publisher"), &publisher);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
    }

    pub fn anchor(env: Env, commitment: BytesN<32>) -> Result<(), Error> {
        let publisher: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("publisher"))
            .unwrap();
        publisher.require_auth();
        if commitment == BytesN::from_array(&env, &[0; 32]) {
            return Err(Error::InvalidCommitment);
        }

        let storage = env.storage().persistent();
        if !storage.has(&commitment) {
            storage.set(&commitment, &true);
            env.events()
                .publish((symbol_short!("anchor"),), commitment.clone());
        }
        storage.extend_ttl(&commitment, TTL_THRESHOLD, TTL_LEDGERS);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_LEDGERS);
        Ok(())
    }

    pub fn has_anchor(env: Env, commitment: BytesN<32>) -> bool {
        env.storage().persistent().has(&commitment)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events as _, MockAuth, MockAuthInvoke};
    use soroban_sdk::IntoVal;

    #[test]
    fn only_publisher_can_anchor_and_replays_preserve_the_exact_record() {
        let env = Env::default();
        let publisher = Address::generate(&env);
        let contract = env.register(ClinicalLinkAnchor, (&publisher,));
        let client = ClinicalLinkAnchorClient::new(&env, &contract);
        let commitment = BytesN::from_array(&env, &[1; 32]);
        let altered = BytesN::from_array(&env, &[2; 32]);

        assert!(!client.has_anchor(&commitment));
        assert!(client.try_anchor(&commitment).is_err());

        let authorization = MockAuth {
            address: &publisher,
            invoke: &MockAuthInvoke {
                contract: &contract,
                fn_name: "anchor",
                args: (&commitment,).into_val(&env),
                sub_invokes: &[],
            },
        };
        client
            .mock_auths(&[authorization.clone()])
            .anchor(&commitment);
        assert_eq!(env.events().all().len(), 1);
        client.mock_auths(&[authorization]).anchor(&commitment);
        assert_eq!(env.events().all().len(), 0);
        assert!(client.has_anchor(&commitment));
        assert!(!client.has_anchor(&altered));
    }

    #[test]
    fn rejects_the_empty_commitment() {
        let env = Env::default();
        let publisher = Address::generate(&env);
        let contract = env.register(ClinicalLinkAnchor, (&publisher,));
        let client = ClinicalLinkAnchorClient::new(&env, &contract);
        env.mock_all_auths();
        let empty = BytesN::from_array(&env, &[0; 32]);
        assert_eq!(client.try_anchor(&empty), Err(Ok(Error::InvalidCommitment)));
        assert!(!client.has_anchor(&empty));
    }
}
