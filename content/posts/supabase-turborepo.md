---
title: Set up a monorepo with Supabase and Turborepo
date: 2022-12-06
draft: false
description: A guide to setting up a pnpm monorepo with Supabase and Turborepo
author: psteinroe
tags: ["Supabase", "Turborepo"]
---

At my current company, we recently migrated our codebase to a [turborepo](https://turbo.build/repo)-powered [pnpm](https://pnpm.io) monorepo, and are now shipping three NextJS apps, a Preact widget, a React Native app and two Fastify servers out of a single repository, all speaking to the same Supabase instance. A monorepo setup not only allows us to share code and configurations, but also decreases ci time and thereby saves $$. It took me a few attempts to properly integrate Supabase with Turborepo, and here is a quick rundown of what I've learned setting up the monorepo.

**tl;dr;** check out the [supasample repository](https://github.com/psteinroe/supasample) if you prefer to read code.

This guide assumes you have basic knowledge about Turborepo and setup a project using pnpm and turborepo already. If that is not the case, I highly recommend skimming through [the turborepo documentation](https://turbo.build/repo/docs/getting-started/create-new). It is one the best I have ever read.

## Declare Supabase as a Workspace

[Workspaces](https://turbo.build/repo/docs/handbook/workspaces) are the building blocks of every monorepo, and are managed by the package manager. To properly integrate Supabase into the monorepo, the `supabase/` directory has to be declared as a workspace itself. First, create `supabase/package.json` and give the workspace a name. I like to prefix all local workspaces with the organisation name, but you can choose any name you want.

```json
{
  "name": "@supasample/supabase"
}
```

Next, to make pnpm aware of the `@supasample/supabase` workspace, add its path to the `pnpm-workspace.yaml` file.

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'supabase'
```

## Add Supabase CLI Commands to the Supabase Workspace

To integrate Supabase in the default development workflow, you need to add the common CLI commands to `supabase/package.json`, namely `start`, `db reset`, `db test`, `db lint` and `deploy`.

```json
{
  "name": "@supasample/supabase",
  "scripts": {
    "start": "supabase status || supabase start",
    "reset": "supabase db reset || supabase start",
    "test": "supabase db test",
    "lint": "supabase db lint",
    "deploy": "supabase link --project-ref $SUPABASE_PROJECT_REF && supabase db push"
  }
}
```

Note that both `start` and `reset` use a try-catch mechanism to make sure that the desired result is achieved, no matter in what state your local Supabase instance currently is.

Next, all scripts declared within the Supabase workspace have to be configured in `turbo.json`.

```json
{
  "$schema": "https://turborepo.org/schema.json",
  "pipeline": {
    // ...
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "start": {
      "outputs": []
    },
    "lint": {
      "dependsOn": ["format:check"],
      "outputs": []
    },
    "deploy": {
      "outputs": []
    }
    // ...
  },
  "globalEnv": [
    "NODE_ENV",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_KEY"
  ]
}
```

Note that the snippet contains only the few configurations necessary for the supabase workspace, you will most likely have a few more in yours.

To test that everything works, run `pnpm run start --filter=supabase` from the repository root. Make sure that your local Docker host is up.

## Configure workspace-task to workspace-task dependencies

Withe the current configuration, you have to run `pnpm run start --filter=supabase` or `supabase start` expliclity before executing any task that requires a running Supabase instance. A GitHub Action workflow might look like this:

```yaml
    ...
    - name: 🏗 Setup Supabase
      uses: supabase/setup-cli@v1
      with:
        version: latest

    - name: 🚀 Start Supabase
      run: supabase db start

    - name: 🦺 Check Format, Lint, Typecheck and Test
      run: pnpm run turbo format:check lint:report typecheck test
    ...
```

Although the team is making continous improvements, starting Supabase takes around 60-90 seconds of your costly GitHub Actions time. In most projects, your database will change the least, and the `test` and `lint` tasks will be replayed from the Turborepo cache 90% of the time. Hence, you are throwing away money here. Fortunately, Turborepo supports [workspace-task to workspace-task dependencies](https://turbo.build/repo/docs/core-concepts/monorepos/running-tasks#specific-workspace-tasks), that can be expressed using the `<workspace>#<task>` syntax. You can leverage this feature to have Turobrepo decide whether it is required to start Supabase.

```json
{
  "pipeline": {
    // ...
    "@supasample/supabase#start": {
      "outputs": [],
      "cache": false
    },
    "@supasample/supabase#test": {
      "dependsOn": ["@supasample/supabase#start", "^build"],
      "outputs": []
    },
    "@supasample/supabase#lint": {
      "dependsOn": ["@supasample/supabase#start", "format:check"],
      "outputs": []
    }
    // ...
  }
}
```

Although it might appear counter intuitive, you want to disable caching for `supabase start`. Next, to ensure that the supabase instance is running before the database is tested or linted, you the respective task configurations, and add the `start` script as a dependency.

If you now run `pnpm run test --filter=supabase`, the supabase instance will be started if not already up, and your GitHub Action can be simplified to

```yaml
    ...
    - name: 🏗 Setup Supabase
      uses: supabase/setup-cli@v1
      with:
        version: latest

    - name: 🦺 Check Format, Lint, Typecheck and Test
      run: pnpm run turbo format:check lint:report typecheck test
    ...
```

## Add `types` Package

The same configuration can be used for other workspaces too. For example, you might have a shared `types` package in your monorepo, from which all packages and apps import the database types generated by the Supabase CLI.

First, add a `generate` script to the respective `package.json`.

```json
{
  "scripts": {
    // ...
    "generate": "(cd ../../ && supabase gen types typescript --local > ./packages/types/src/database.ts) && prettier --write \"src/**/*.{ts,tsx,md}\""
    // ...
  }
}
```

The script first changes into the root directory before running the type generation. All types are written into a `database.ts` file of the same package. Finally, the generated types are formatted using prettier.

You might have noticed that the `--local` flag is used. To ensure you have a Supabase instance running, configure the `generate` task similar to the `test` and `lint` tasks within the `turbo.json` file:

```json
{
  "pipeline": {
    // ...
    "generate": {
      "dependsOn": ["^generate"],
      "outputs": []
    },
    "@supasample/types#generate": {
      "dependsOn": ["@supasample/supabase#start", "^generate"],
      "outputs": []
    }
    // ...
  }
}
```

If you now run `pnpm run generate`, and Turborepo will make sure you have a Supabase instance running before the types are generated.

Thanks for reading!
