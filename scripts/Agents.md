General Repository Hygiene
Do not generate any unwarranted or not-asked markdown file to summarize or document an action taken unless asked explicitly to do so
Even if a markdown file is generated upon asking, it should always reside in the 'documentation' folder at the root of the directory and NO WHERE ELSE
Even after that if the markdown file is generated and you are confused where to keep it, ask a question to where to store
Do not create unnecessary .sh or shell scripts for every automation unless required and asked explicitly
[Most important] Whenever a front-end specific file changes are done, specially in css, js or tsx etc file, make sure to run the build again to reflect latest changes
[Most important] For this SamsungRemote React Native app: after ANY change to the app (App.tsx, src/, android/, package.json, metro config, etc.), ALWAYS run from project root: ./scripts/refresh-app.sh — this restarts Metro with clean cache and deploys to the connected device so new changes are reflected without the user doing it manually
[Most important] Make a local commit after every changes you run as an agent, without fail for easy logs.
All UI/UX design should be made in Shadcn or Tailwind only for any small module, or large feature
The header, footer, logo, meta tags, etc should always be component based to re-use everywhere and make editing at single source
All functionalities and design should be mobile and tablet friendly always, make decisions to prioritize this always
Do not push the code to main branch without confirmation
All error states should have clear focus on message and not allow user to get distracted from the message at any times
All links for images, files or any static assets should always be referenced from a common config, array or some json that is easy to manage later
The local build should always work on local files but the production or staging build should always serve from a CDN link and thus should be configured.
The assets in public folder should at every build be synced to a cloud storage that is configured and only those cloud links should be used
For all the features developed, tests should be written in parallel, follow TDD approach always
Befor every commit, scan for sensitive files if any that is part of commit and suggest to remove that
Alwauys follow the most common Design Principles in System Design such as : Separation of Concerns, Encapsulation and Abstraction, Loose Coupling and High, Cohesion, Scalability and Performance, Resilience to Fault Tolerance, Security and Privacy
Always remember the idea is not just build anything but to learn also, so all your summaries should make sure that it teaches me something valuable, include a small nuggest of insight or learning for me always.
If the change or feature make edits to both backend and front-end, update the tests for both or write if not available
Every now and then run both backend and frontend tests to keep checking if all functionalties are working fine or not.
For any 3P API integration, always create a mock-testing setup, manageable by .env variable to test the same without calling the API
Since, I will always do docker based deployment, all my CI-CD pipelines should have front-end build done and synced to cloud storage during docker build stage only and not on CI-CD workflow stage and the front-end package may require composer or other setups too
I will always use a reverse proxy setup with docker nginx to serve the app, so create the docker compose file setup accordingly