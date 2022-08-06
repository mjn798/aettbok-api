# Ættbok API

Provides an API framework to interact with Neo4J and Redis.

All requests (except /ping) must be authenticated via a Firebase jwt token.

## Installation

Create .env file in the project root

```
GOOGLE_APIS=""
NEO4J_HOST=""
NEO4J_USERNAME=""
NEO4J_PASSWORD=""
REDIS_PORT=""
REDIS_GOOGLEAPIKEY_SEC=""
REDIS_NODECACHE_SEC=""
```

Install with

```
npm install
```