// configure imports

const db    = require('./neo4j')
const redis = require('redis')
const https = require('https')

// configure Redis Client connection

const client = redis.createClient(6379)
.on('connect',      () => console.info('redisClient:connected'))
.on('end',          () => console.info('redisClient:disconnected'))
.on('reconnecting', () => console.info('redisClient:reconnecting'))
.on('error',        (error) => { console.error('redisClient:error', error) });

// connect Redis Client

(async () => {
    try      { await client.connect() }
    catch(e) { console.error('redisClient:connect:error', e) }
})()



/* TOKEN VALIDATION */



// get or set Google API Key

async function getGoogleApiKey(apikey) {

    return await client.get(apikey)
    .then(async (key, error) => {

        // Redis Client error = (500)
        if (error) { return { error: 500 }}

        // found key:value in cache
        if (key) { return { key: key }}

        // did not find key:value in cache
        return await getGoogleApiKeys()
        .then(result => {

            // missing key from Google API = (500)
            if (!result[apikey]) { return { error: 500 } }

            // cache and set new key:value
            client.setEx(apikey, process.env.REDIS_GOOGLEAPIKEY_SEC, result[apikey])
            return { key: result[apikey] }

        })
        .catch(error => { return { error: error } })

    })
    .catch(() => { return { error: 500 } })

}

// get Google API Keys for JWT validation

function getGoogleApiKeys() {
    return new Promise((resolve, reject) => {

        return https.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', (response) => {

            let body = ''

            response.setEncoding('utf-8')
            response.on('data',  (chunk) => { body += chunk })
            response.on('end',   () => resolve(JSON.parse(body)))

        })
        .on('error', () => reject(500))

    })
}



/* DATABASE CACHING */



// get nodes with specific label from cache or database

async function getNodesWithLabel(label) {

    return await client.get(label)
    .then(async (nodes, error) => {

        // Redis Client error = (500)
        if (error) { return { error: 500 }}

        // found key:value in cache
        if (nodes) { return JSON.parse(nodes) }

        // did not find key:value in cache
        return db.getNodesWithLabel(label)
        .then(result => {
            // cache and set new key:value
            client.setEx(label, 60, JSON.stringify(result))
            return result
        })
        .catch(error => { return { error: error }})

    })
    .catch(() => { return { error: 500 }})

}

// get a specific node from cache or database

async function getNodeWithLabelAndId(label, id) {

    /*
        if not set, check `nodes:label` first
        if not found, then read from database
        set individual cache node
    */

    return await client.get(`${label}:${id}`)
    .then(async (node, error) => {

        // Redis Client error = (500)
        if (error) { return { error: 500 }}

        // found key:value in cache
        if (node) { return JSON.parse(node) }

        // did not find key:value in cache
        return db.getNodeWithLabelAndId(label, id)
        .then(result => {
            // cache and set new key:value
            client.setEx(`${label}:${id}`, 60, JSON.stringify(result))
            return result
        })
        .catch(error => { return { error: error }})

    })
    .catch(() => { return { error: 500 }})

}

// delete a key from cache

function deleteEntry(id) { return client.del(id) }



/* EXPORT MODULES */

module.exports = {
    deleteEntry,
    getGoogleApiKey,
    getNodesWithLabel,
    getNodeWithLabelAndId,
}