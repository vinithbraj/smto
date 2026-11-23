# SMTO privacy and permissions

## Access is specific, not automatic

A tool can be installed without being allowed. Actions may require a permission decision, a connected account, or a particular Gateway. Approving one request does not grant unlimited access, override other restrictions, or prove that the action succeeded.

[Understand tool access and approvals](https://vinithbraj.github.io/smto/learn/agent-capabilities-and-permissions/).

## The selected target matters

The controller manages tasks; a Gateway executes file and command tools on the chosen computer. Check the target before approving an operation that reads, changes, or deletes information. Other tools may run in the controller or through connected services, so review the specific action—not only the machine name.

## Local installation does not mean zero network traffic

You can run the controller and a compatible model on computers you control without an SMTO-hosted cloud service. If you choose an online model provider, information sent in model requests reaches that provider. A tool may also contact an online service even when the model is local. Offline work requires locally available models, files, and tools.

[Plan a local or offline setup](https://vinithbraj.github.io/smto/learn/local-first-ai-agents/).

## Treat credentials and saved content carefully

Use the provided credentials and private-parameter settings for secrets. Do not put access keys or passwords in chat notes, public documents, or long-term Memory. Saved information may later be returned to the model, and redaction settings do not cover every possible output. Review activity records before sharing them.

## Verify what you install

A SHA-256 checksum helps detect a changed or damaged file. It does not establish who published the file. Where additional signing, build, or software-inventory evidence is supplied, review and verify it independently. Do not imply that a download has been signed when its artifact record says otherwise.

[See download verification instructions](https://vinithbraj.github.io/smto/download/).

## This public website is separate from your controller

The SMTO website does not run your agent tasks or read your local conversations. It does not use advertising trackers or third-party analytics. Video previews use images served by this website. If you choose to play a YouTube demonstration, your browser connects to YouTube, which may collect information under its own policies. The site does not contact YouTube merely because you open this page. Hosting providers may keep routine access logs.

When enabled, the footer's unique visitor count uses a random first-party cookie to count each browser once. The cookie lasts one year and is renewed when you visit. The counter stores only a hash of that random identifier, not your IP address, browsing history, or browser details. It requires JavaScript and cookies. Clearing or expiring the cookie, private browsing, or using another browser can count you again. The total starts when counting is enabled and does not include earlier visits.
