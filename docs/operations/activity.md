## Reading execution activity

**Activity Trace** is the history of what happened during a task. Open it to see
which tools ran, which computer they used, the information they received, and what
they returned. A tool finishing successfully does not prove the whole request was
answered correctly. Check the final result too.

### Check tool access and approvals

The history shows when tools were selected, enabled, blocked, or approved. These
are different steps. Knowing that a tool exists does not mean it ran. Allowing a
tool does not approve every action it could take. When approved access lets a task
continue, the other restrictions still apply.

### Read output without stopping the work

For a command, opening the output only shows what it has returned. Closing that
view or your browser tab does not cancel the command. No new output means only
that nothing new has arrived; it does not prove the work finished.

Check the recorded result to see whether the command completed or failed. If an
action may have made a change but its final result is missing, find out what
happened before repeating it.

### Follow work that is still running

Open **Monitoring activity** to see the action being watched. When available, it
shows the selected computer, folder, and a short command preview. Each dated
update explains the reported status. Actions running at the same time keep their
own details.

If the command's start is outside the visible history, opening the details can
retrieve its saved information. This does not ask the AI to do more work or run
the command again. Older or incomplete records may say that some details are
unavailable. The same recorded actions can be viewed on desktop, mobile, or after
reopening the conversation.

### Understand what the history can show

The amount of detail depends on what your settings keep and display. Looking at
the history does not change permissions. The AI output view can only show fields
the provider sent and SMTO retained; it cannot reveal private internal reasoning.
SMTO checks saved tool results when deciding whether work is complete, rather
than relying only on what is visible in the browser.

Settings that hide sensitive information do not cover every kind of output.
Review records before sharing them. Commands, user content, or account details
may still contain private information.

Private tool diagnostics do not hide the conversation itself. Opening plans,
progress messages, and final answers remain visible during execution and after
reopening the conversation. An opening overview, when provided, is labeled **Agent plan**.
If the model omits it, execution continues without an opening message.
Diagnostic logs omit private tool payloads and raw model responses; chat delivery
retains only fields explicitly published for the user, with the configured
credential redaction still applied. A missing final answer produces a factual
runtime completion report without copying tool content or making another model call.
