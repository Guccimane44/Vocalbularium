### Q17
External identity at 1.0: OAuth sign-in plus passkeys. No passwords are stored. Less password plumbing; adds provider dependency and account-linking edge cases. Resolves C2 in the [traceability map](../traceability-map.md#conflicts). Providers, account linking, and recovery are open (K13).

### Q18
(b) Hosted hub

### Q19
Keep serialized + explicit resubmission

### Q20
Private only. Sharing decks or kartes with other accounts is deferred and is not part of the product specs (revised from collaborator sharing to resolve C10). Every deck and karte belongs to exactly one account (Q35 `account_id`), so per-account serialization (Q26) and account isolation (Q57) need no sharing rules.

### Q21
long-lived multi-device + explicit revoke