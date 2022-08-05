// configure imports

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

function getGoogleApiKey(apikey) {
    return new Promise((resolve, reject) => {

        return client.get(apikey)
        .then(async (key, error) => {

            // Redis Client error = (500)
            if (error) { return reject(500) }

            // found cached key
            if (key) { return resolve(key) }

            // did not find cached key
            return getGoogleApiKeys()
            .then(result => {

                // missing key from Google API = (500)
                if (!result[apikey]) { return reject(500) }

                // cache and set new key
                client.setEx(apikey, process.env.REDIS_NODECACHE_SEC, result[apikey])
                return resolve(result[apikey])

            })
            .catch(error => reject(error))

        })
        .catch(() => reject(500))

    })

}

// get Google API Keys for JWT validation

function getGoogleApiKeys() {
    return new Promise((resolve, reject) => {

        return https.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', (response) => {

            let body = ''

            response.setEncoding('utf-8')
            response.on('data',  (chunk) => body += chunk)
            response.on('end',   () => resolve(JSON.parse(body)))

        })
        .on('error', () => reject(500))

    })
}



/* NODE CACHING */



// function setEntry(id, value) { return client.set(id, value) }
function setEntry(id, value) { return client.setEx(id, process.env.REDIS_NODECACHE_SEC, JSON.stringify(value)) }

function deleteEntry(id) { return client.del(id) }

function getEntry(id) {
    return new Promise((resolve, reject) => {

        return client.get(id)
        .then((node, error) => {

            // Redis Client error = (500)
            if (error) { return reject(500) }

            // found id
            if (node) { return resolve(JSON.parse(node)) }

            return resolve(null)

        })
        .catch(() => reject(500))

    })
}



/* EXPORT MODULES */

module.exports = {
    deleteEntry,
    getEntry,
    getGoogleApiKey,
    setEntry,
}