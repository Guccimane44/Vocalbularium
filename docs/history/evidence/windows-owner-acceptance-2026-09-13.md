# Owner Windows acceptance — 13 September 2026

The owner accepted the current MVP baseline after testing package 0.1.0 on Windows 11 with Chrome 153.9.8010.37 (official build, 64-bit). These are owner-reported results from the linked GitHub comments, separate from the automated and hosted checks in [M5](../M5-Acceptance.md).

| Source | Reported result |
| --- | --- |
| [Foundation acceptance, #6](https://github.com/Guccimane44/Vocalbularium/issues/6#issuecomment-5653069172) | Installation/reload; word, phrase, and sentence capture; feedback; editing; retry; deletion; synchronization; background behavior; and final publication/exit boundary passed. |
| [Native capture acceptance, #8](https://github.com/Guccimane44/Vocalbularium/issues/8#issuecomment-5653086002) | Native context-menu capture and feedback worked as desired. |
| [Reliability acceptance, #11](https://github.com/Guccimane44/Vocalbularium/issues/11#issuecomment-5653175433) | All other M5 acceptance checks passed, with the Render stale-client reset scenario explicitly deferred. The owner also marked the Windows, final publication/exit, and offline-ordering checklist items complete. |

The exact background-mode setting and the tested archive checksum were not included in the comments. The delivered candidate's separate source/checksum record remains in [issue #12](https://github.com/Guccimane44/Vocalbularium/issues/12).

## Deferred verification

The owner deferred stale extension sign-in and pending-save testing after a Render sleep/redeploy reset because that environment is not being tested yet. [Issue #24](https://github.com/Guccimane44/Vocalbularium/issues/24) retains this follow-up. No passing result is claimed for it.

Render Free's temporary account storage remains the accepted test-phase constraint. Durable hosted storage and always-on availability remain production work under the [scope exception](../MVP-Product-scope.md#10-first-iteration-delivery-and-deferred-work). This acceptance record changes no capture, generation, save, retry, or interruption rules.
