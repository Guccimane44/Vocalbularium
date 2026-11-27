---------------------------- MODULE Captures ----------------------------
(***************************************************************************)
(* A capture, from the menu click to a saved page, across lost replies,   *)
(* Try saving again, worker restarts and browser restarts.                 *)
(*                                                                         *)
(* Each action names the code it stands for. One action is one step the   *)
(* code cannot interleave: a store `command` runs in one transaction       *)
(* through the ordered executor (src/persistence/postgres.ts), so a whole  *)
(* request on the server is one step. The worker's steps are its awaits.   *)
(*                                                                         *)
(* Session IDs are modelled by their epoch: one installation, so each      *)
(* epoch has exactly one session (background-runtime.js `initialize`).     *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Captures,    \* operation IDs of captures the user makes
  Procs,       \* submits that can be in flight at once in one worker
  Snaps,       \* deck configurations a snapshot can hold
  MaxEpoch,    \* bound on browser sessions (browser restarts + 1)
  MaxWorkers,  \* bound on worker incarnations (worker or browser restarts + 1)
  MaxSends,    \* bound on requests sent in one behaviour
  Breaks       \* code mistakes to model, to show each rule can fail; {} for the real code

VARIABLES
  \* The extension.
  epochLocal,  \* chrome.storage.local `epoch`
  bsession,    \* chrome.storage.session `session`, by epoch; 0 when none
  worker,      \* worker incarnation, for the bounds only
  inited,      \* the worker's `initialization` has completed
  menu,        \* the capture menu item exists (context-menu.js captureMenu)
  local,      \* chrome.storage.local `capture-<id>` receipts
  procs,       \* `submit` calls in flight
  sends,       \* requests sent so far; also each request's ID
  \* The wire.
  net,         \* requests sent and not yet served or lost
  \* The server (src/core/store-sessions.mjs, store-generation.mjs).
  srvCurrent,  \* installations row: the current session's epoch; 0 when none
  config,      \* the default deck's configuration now
  srvPrep,     \* receipt of `prepare-<id>`: its snapshot, or "none"
  srvCap,      \* receipt of `<id>` (capture): its fingerprint, or not set
  pages,       \* pages saved for each capture
  gen,         \* the capture's attempts: "none", "loading", "failed", "done"
  reused,      \* a capture request was refused as operation_reused
  made         \* the user made this capture: a record for the rules, not in the code

vars == <<epochLocal, bsession, worker, inited, menu, local, procs, sends, net,
          srvCurrent, config, srvPrep, srvCap, pages, gen, reused, made>>

NoReceipt == [state |-> "none", prepared |-> FALSE, snap |-> "none",
              origin |-> 0, interrupted |-> FALSE]
NoReply == [ok |-> FALSE, val |-> "none", code |-> "none"]
Idle == [busy |-> FALSE, c |-> "none", by |-> "none", rc |-> NoReceipt,
         cur |-> 0, pc |-> "idle", req |-> 0, reply |-> NoReply, replied |-> FALSE]

Init ==
  /\ epochLocal = 0 /\ bsession = 0 /\ worker = 1 /\ inited = FALSE /\ menu = FALSE
  /\ local = [c \in Captures |-> NoReceipt]
  /\ procs = [p \in Procs |-> Idle]
  /\ sends = 0 /\ net = {}
  /\ srvCurrent = 0 /\ config \in Snaps
  /\ srvPrep = [c \in Captures |-> "none"]
  /\ srvCap = [c \in Captures |-> [set |-> FALSE, origin |-> 0, snap |-> "none", cur |-> 0]]
  /\ pages = [c \in Captures |-> 0]
  /\ gen = [c \in Captures |-> "none"]
  /\ reused = [c \in Captures |-> FALSE]
  /\ made = [c \in Captures |-> FALSE]

----------------------------------------------------------------------------
(* Restarts *)

\* Chrome stops an idle worker; `chrome.storage.session` survives it.
WorkerRestart ==
  /\ worker < MaxWorkers
  /\ worker' = worker + 1 /\ inited' = FALSE
  /\ procs' = [p \in Procs |-> Idle]
  /\ UNCHANGED <<menu, made, epochLocal, bsession, local, sends, net, srvCurrent, config,
                 srvPrep, srvCap, pages, gen, reused>>

\* The browser closes: the worker goes, and `chrome.storage.session` is cleared.
BrowserRestart ==
  /\ worker < MaxWorkers /\ bsession # 0
  /\ worker' = worker + 1 /\ inited' = FALSE /\ bsession' = 0
  /\ procs' = [p \in Procs |-> Idle]
  /\ UNCHANGED <<menu, made, epochLocal, local, sends, net, srvCurrent, config,
                 srvPrep, srvCap, pages, gen, reused>>

----------------------------------------------------------------------------
(* initialize() in background-runtime.js *)

\* No session in chrome.storage.session: make one with the next epoch.
StartSession ==
  /\ ~inited /\ bsession = 0 /\ epochLocal < MaxEpoch
  /\ epochLocal' = epochLocal + 1 /\ bsession' = epochLocal + 1
  /\ UNCHANGED <<menu, made, worker, inited, local, procs, sends, net, srvCurrent, config,
                 srvPrep, srvCap, pages, gen, reused>>

\* /api/session (SessionStore.openSession), then captures.reconcile(session).
\* A newer session fails the installation's loading attempts; reconcile turns
\* every `saving` capture receipt into `pending` with "The save was interrupted".
\* An older session is refused (stale_session) and initialize fails: no step.
OpenSessionAndReconcile ==
  /\ ~inited /\ bsession # 0 /\ bsession >= srvCurrent
  /\ srvCurrent' = bsession
  /\ gen' = IF bsession > srvCurrent
              THEN [c \in Captures |-> IF gen[c] = "loading" THEN "failed" ELSE gen[c]]
              ELSE gen
  /\ local' = [c \in Captures |->
                 IF local[c].state = "saving"
                   THEN [local[c] EXCEPT !.state = "pending", !.interrupted = TRUE]
                   ELSE local[c]]
  /\ inited' = TRUE
  \* refreshAccount then calls updateCaptureMenu(account): the menu item exists.
  /\ menu' = TRUE
  /\ UNCHANGED <<made, epochLocal, bsession, worker, procs, sends, net, config,
                 srvPrep, srvCap, pages, reused>>

----------------------------------------------------------------------------
(* The user *)

\* handleCapture in capture.js: the menu item, made by an earlier initialize,
\* survives a worker restart; the click needs a session in
\* chrome.storage.session, not a finished initialize in this worker. It keeps a
\* `saving` receipt with the cached deck snapshot, then calls submit.
Capture(c, p) ==
  /\ menu /\ ~made[c] /\ bsession # 0 /\ ~procs[p].busy
  /\ \E s \in Snaps :
       LET rc == [state |-> "saving", prepared |-> FALSE, snap |-> s,
                  origin |-> bsession, interrupted |-> FALSE]
       IN /\ local' = [local EXCEPT ![c] = rc]
          /\ procs' = [procs EXCEPT ![p] =
                         [Idle EXCEPT !.busy = TRUE, !.c = c, !.by = "menu",
                                      !.rc = rc, !.pc = "ctx"]]
  /\ made' = [made EXCEPT ![c] = TRUE]
  /\ UNCHANGED <<menu, epochLocal, bsession, worker, inited, sends, net, srvCurrent,
                 config, srvPrep, srvCap, pages, gen, reused>>

\* Try saving again (`try-saving-again` in background-runtime.js): submit the
\* stored receipt as it is, whenever it is not `saved`.
TryAgain(c, p) ==
  /\ local[c].state \in {"saving", "pending"} /\ ~procs[p].busy
  /\ procs' = [procs EXCEPT ![p] =
                 [Idle EXCEPT !.busy = TRUE, !.c = c, !.by = "retry",
                              !.rc = local[c], !.pc = "ctx"]]
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, local, sends, net,
                 srvCurrent, config, srvPrep, srvCap, pages, gen, reused>>

\* Deck settings change the default deck's configuration.
DeckChange ==
  /\ \E s \in Snaps : s # config /\ config' = s
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, local, procs, sends, net,
                 srvCurrent, srvPrep, srvCap, pages, gen, reused>>

----------------------------------------------------------------------------
(* submit() in capture.js, one await per step *)

\* context(): awaits initialize, then reads the current session.
Ctx(p) ==
  /\ procs[p].pc = "ctx" /\ inited
  /\ procs' = [procs EXCEPT ![p].cur = bsession,
                            ![p].pc = IF procs[p].rc.prepared THEN "capture" ELSE "prepare"]
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, local, sends, net,
                 srvCurrent, config, srvPrep, srvCap, pages, gen, reused>>

SendPrepare(p) ==
  /\ procs[p].pc = "prepare" /\ sends < MaxSends
  /\ sends' = sends + 1
  /\ net' = net \cup {[kind |-> "prepare", c |-> procs[p].c, origin |-> procs[p].rc.origin,
                       snap |-> "none", cur |-> 0, p |-> p, id |-> sends + 1]}
  /\ procs' = [procs EXCEPT ![p].pc = "prepWait", ![p].req = sends + 1,
                            ![p].replied = FALSE, ![p].reply = NoReply]
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, local, srvCurrent, config,
                 srvPrep, srvCap, pages, gen, reused>>

SendCapture(p) ==
  /\ procs[p].pc = "capture" /\ sends < MaxSends
  /\ sends' = sends + 1
  /\ net' = net \cup {[kind |-> "capture", c |-> procs[p].c, origin |-> procs[p].rc.origin,
                       snap |-> procs[p].rc.snap, cur |-> procs[p].cur, p |-> p, id |-> sends + 1]}
  /\ procs' = [procs EXCEPT ![p].pc = "capWait", ![p].req = sends + 1,
                            ![p].replied = FALSE, ![p].reply = NoReply]
  \* Break "saved-before-reply": the receipt is written saved as the request
  \* goes out, before the store has answered.
  /\ local' = IF "saved-before-reply" \in Breaks
                THEN [local EXCEPT ![procs[p].c] = [procs[p].rc EXCEPT !.state = "saved"]]
                ELSE local
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, srvCurrent, config,
                 srvPrep, srvCap, pages, gen, reused>>

\* The catch in submit: `{ ...receipt, state: 'pending', error }`, where receipt
\* is submit's own copy, prepared or not.
\* Break "fail-drops-receipt": the catch removes the receipt instead.
FailWith(p) ==
  /\ local' = [local EXCEPT ![procs[p].c] =
                 IF "fail-drops-receipt" \in Breaks THEN NoReceipt
                 ELSE [procs[p].rc EXCEPT !.state = "pending", !.interrupted = FALSE]]
  /\ procs' = [procs EXCEPT ![p] = Idle]

\* A fetch fails: no reply came, or the reply was lost after the server served it.
Timeout(p) ==
  /\ procs[p].pc \in {"prepWait", "capWait"}
  /\ FailWith(p)
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, sends, net, srvCurrent,
                 config, srvPrep, srvCap, pages, gen, reused>>

\* The prepare reply. A snapshot: the receipt is marked prepared and written.
\* stale_session for a receipt from an earlier session: keep the invocation
\* snapshot and go on. Anything else fails.
PrepareReply(p) ==
  /\ procs[p].pc = "prepWait" /\ procs[p].replied
  /\ LET r == procs[p].reply
         rc2 == [procs[p].rc EXCEPT !.prepared = TRUE, !.snap = r.val]
     IN IF r.ok
          THEN /\ local' = [local EXCEPT ![procs[p].c] = rc2]
               /\ procs' = [procs EXCEPT ![p].rc = rc2, ![p].pc = "capture"]
        ELSE IF r.code = "stale" /\ procs[p].cur # procs[p].rc.origin
          THEN /\ procs' = [procs EXCEPT ![p].pc = "capture"]
               /\ UNCHANGED local
        ELSE FailWith(p)
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, sends, net, srvCurrent,
                 config, srvPrep, srvCap, pages, gen, reused>>

\* The capture reply: refresh() writes the receipt `saved` with its page.
CaptureReply(p) ==
  /\ procs[p].pc = "capWait" /\ procs[p].replied
  /\ IF procs[p].reply.ok
       THEN /\ local' = [local EXCEPT ![procs[p].c] = [procs[p].rc EXCEPT !.state = "saved"]]
            /\ procs' = [procs EXCEPT ![p] = Idle]
       ELSE FailWith(p)
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, sends, net, srvCurrent,
                 config, srvPrep, srvCap, pages, gen, reused>>

\* clearHandedOffCaptures: a `saved` receipt whose page the account lists goes.
HandOff(c) ==
  /\ local[c].state = "saved" /\ pages[c] >= 1
  /\ local' = [local EXCEPT ![c] = [NoReceipt EXCEPT !.state = "gone"]]
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, procs, sends, net,
                 srvCurrent, config, srvPrep, srvCap, pages, gen, reused>>

----------------------------------------------------------------------------
(* The server *)

\* The reply reaches its submit only if that submit is still waiting for it.
Reply(m, r) ==
  procs' = IF procs[m.p].busy /\ procs[m.p].req = m.id
             THEN [procs EXCEPT ![m.p].reply = r, ![m.p].replied = TRUE]
             ELSE procs

Ok(v) == [ok |-> TRUE, val |-> v, code |-> "none"]
Err(code) == [ok |-> FALSE, val |-> "none", code |-> code]

\* GenerationStore.prepareCapture inside command(): a receipt replays first;
\* then requireSession(session); then the deck's snapshot now.
ServePrepare(m) ==
  /\ m \in net /\ m.kind = "prepare"
  /\ net' = net \ {m}
  /\ IF srvPrep[m.c] # "none"
       THEN Reply(m, Ok(srvPrep[m.c])) /\ UNCHANGED srvPrep
     ELSE IF m.origin # srvCurrent
       THEN Reply(m, Err("stale")) /\ UNCHANGED srvPrep
     ELSE /\ srvPrep' = [srvPrep EXCEPT ![m.c] = config]
          /\ Reply(m, Ok(config))
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, local, sends, srvCurrent,
                 config, srvCap, pages, gen, reused>>

\* GenerationStore.capture inside command(): the fingerprint is the payload
\* (session, main key, context, snapshot), not recoverySession. A receipt
\* replays or refuses (operation_reused); then requireSession(recoverySession);
\* then the page, its attempts failed at once if interrupted. The route starts
\* generation for a first, uninterrupted capture.
\* Break "no-replay": command() runs the action without reading its receipt.
\* Break "recovery-in-fingerprint": the fingerprint also holds recoverySession.
\* Break "interrupted-generates": an interrupted capture's attempts stay loading.
ServeCapture(m) ==
  /\ m \in net /\ m.kind = "capture"
  /\ net' = net \ {m}
  /\ IF srvCap[m.c].set /\ "no-replay" \notin Breaks
       THEN IF srvCap[m.c].origin = m.origin /\ srvCap[m.c].snap = m.snap
               /\ ("recovery-in-fingerprint" \notin Breaks \/ srvCap[m.c].cur = m.cur)
              THEN Reply(m, Ok("page")) /\ UNCHANGED <<menu, made, srvCap, pages, gen, reused>>
              ELSE /\ reused' = [reused EXCEPT ![m.c] = TRUE]
                   /\ Reply(m, Err("reused"))
                   /\ UNCHANGED <<menu, made, srvCap, pages, gen>>
     ELSE IF m.cur # srvCurrent
       THEN Reply(m, Err("stale")) /\ UNCHANGED <<menu, made, srvCap, pages, gen, reused>>
     ELSE /\ srvCap' = [srvCap EXCEPT ![m.c] = [set |-> TRUE, origin |-> m.origin, snap |-> m.snap, cur |-> m.cur]]
          /\ pages' = [pages EXCEPT ![m.c] = @ + 1]
          /\ gen' = [gen EXCEPT ![m.c] =
                       IF m.cur # m.origin /\ "interrupted-generates" \notin Breaks
                         THEN "failed" ELSE "loading"]
          /\ Reply(m, Ok("page"))
          /\ UNCHANGED reused
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, local, sends, srvCurrent,
                 config, srvPrep>>

\* A request lost on the way: the server never sees it.
Lose(m) ==
  /\ m \in net
  /\ net' = net \ {m}
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, local, procs, sends,
                 srvCurrent, config, srvPrep, srvCap, pages, gen, reused>>

\* The capture's attempts finish and are published by their session.
Generated(c) ==
  /\ gen[c] = "loading"
  /\ gen' = [gen EXCEPT ![c] = "done"]
  /\ UNCHANGED <<menu, made, epochLocal, bsession, worker, inited, local, procs, sends, net,
                 srvCurrent, config, srvPrep, srvCap, pages, reused>>

\* Nothing left to do: lets a finished behaviour end without a deadlock.
Done ==
  /\ \A p \in Procs : ~procs[p].busy
  /\ net = {}
  /\ UNCHANGED vars

\* TLC names a step by the operator in Next; quantified over `net`, a variable,
\* it would print "Next", so each server action quantifies inside its own name.
ServeSomePrepare == \E m \in net : ServePrepare(m)
ServeSomeCapture == \E m \in net : ServeCapture(m)
LoseSomeRequest == \E m \in net : Lose(m)

\* One disjunct per action, so TLC names each step of a counterexample.
Next ==
  \/ WorkerRestart \/ BrowserRestart \/ StartSession \/ OpenSessionAndReconcile
  \/ \E c \in Captures, p \in Procs : Capture(c, p)
  \/ \E c \in Captures, p \in Procs : TryAgain(c, p)
  \/ DeckChange
  \/ \E p \in Procs : Ctx(p)
  \/ \E p \in Procs : SendPrepare(p)
  \/ \E p \in Procs : SendCapture(p)
  \/ \E p \in Procs : Timeout(p)
  \/ \E p \in Procs : PrepareReply(p)
  \/ \E p \in Procs : CaptureReply(p)
  \/ \E c \in Captures : HandOff(c)
  \/ \E c \in Captures : Generated(c)
  \/ ServeSomePrepare \/ ServeSomeCapture \/ LoseSomeRequest
  \/ Done

Spec == Init /\ [][Next]_vars

----------------------------------------------------------------------------
(* The rules (docs/subsystems/capture-and-save.md) *)

\* A capture never makes a second page, whatever is resent.
OnePage == \A c \in Captures : pages[c] <= 1

\* A capture the user made is never lost: it has its page, or a receipt to retry.
NeverLost == \A c \in Captures :
  made[c] => pages[c] = 1 \/ local[c].state \in {"saving", "pending"}

\* A receipt says saved only when its page exists.
SavedHasPage == \A c \in Captures : local[c].state = "saved" => pages[c] = 1

\* No capture is refused as operation_reused: such a capture could never be saved.
NeverReused == \A c \in Captures : ~reused[c]

\* No attempt keeps loading once its session has ended.
Fenced == \A c \in Captures : gen[c] = "loading" => srvCap[c].origin = srvCurrent

\* A save in flight shows no recovery notice: the menu click's own submit is
\* never told its save was interrupted while it is still running.
InFlightNotInterrupted == \A p \in Procs :
  procs[p].busy /\ procs[p].by = "menu" => ~local[procs[p].c].interrupted

\* Bounds for the model checker.
Bounds == sends <= MaxSends /\ epochLocal <= MaxEpoch /\ worker <= MaxWorkers
=============================================================================
