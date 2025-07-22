> 🚨 **NOTICE**: This project status is still WIP

---

# Baileys API

An implementation of [baileys](https://github.com/WhiskeySockets/baileys) as REST API that supports managing multiple connections at once

## Requirements

- Latest version of **NodeJS v20** or any higher major versions
- **PostgreSQL** database. It's possible to use other databases, but you might've to update the **drizzle** schema and adjust some part of the codes

## Installation

1. Download or clone this repo. If you want to skip the build step, you can download the prebuilt one (file with the `baileys-api-VERSION.tgz` name pattern) from the release page
2. Enter to the project directory
3. Install the dependencies

```sh
npm install
```

4. Build the project using the `build` script

```sh
npm run build
```

You can skip this part if you're using the prebuilt one from the release page

## Setup

1. Copy the `.env.example` file and rename it into `.env`, then update your connection url in the `DATABASE_URL` field
1. Run the migration

```sh
npm run db:migrate
```

or push the schema

```sh
npm run db:push
```

Don't forget to always re-run those whenever there's a change on the `migrations/` directory

## `.env` Configurations

```env
# Environment
NODE_ENV=development
# Pino log level
LOG_LEVEL=debug
# Database connection url
DATABASE_URL=postgres://user:password@localhost:5432/baileys_api
# App port
PORT=3000
# Max reconnect attempts before a connection is destroyed
MAX_RECONNECT_ATTEMPTS=5
# Interval for each reconnect, this uses exponential backoff
RECONNECT_INTERVAL=5000
# Max qr generation attempts before a connection is destroyed
MAX_QR_ATTEMPTS=5
# Timeout for authenticating using pair code before a connection is destroyed
PAIR_CODE_TIMEOUT=600000
```

## Usage

1. Make sure you have completed the **Installation** and **Setup** step
2. You can then start the app using the `start` script

```sh
npm run start
```

3. Now the endpoint should be available according to your environment variables configuration. Default is at `http://localhost:3000`

## API Docs

The API follow OpenAPI v3.0 spec that's accessible at `/doc`. Additionally, a SwaggerUI is also available at `/ui`

## Notes

- There's no default authentication, you may want to implement your own. There's no opinionated way for authentication, use whatever suits your need

## Notice

This project is not affiliated in any way, and is not intended for spamming or any activities that's prohibited by **WhatsApp**