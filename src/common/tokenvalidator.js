// configure imports

const aettbok = require('./aettbok')
const redis   = require('../db/redis')
const https   = require('https')
const jwt     = require('jsonwebtoken')



/* TOKEN VALIDATION */



// validate authentication token

/*
    generic response for any kind of request
    401 (Unauthorized)          = no token or invalid token
    500 (Internal Server Error) = authentication provider or cache issues
*/

async function validateToken(req, res, next) {

    // authentication token and header
    let authenticationDetails = getAuthenticationDetails(req)

    if (!authenticationDetails) { return aettbok.sendError(req, res, 401, 'tokenvalidator:invalidToken') }

    // get cached key
    return getGoogleApiKey(authenticationDetails.header.kid)
    .then(result => jwt.verify(authenticationDetails.token, result, { algorithms: [authenticationDetails.header.alg] }, (error, data) => {

        // invalid token = (401)
        if (error) { return aettbok.sendError(req, res, 401, 'tokenvalidator:invalidToken') }

        // store userid (sub[ject]) in request and continue
        req.sub = data.sub
        return next()

    }))
    .catch(error => aettbok.sendError(req, res, error, 'tokenvalidator:GoogleApiKeyError'))

}

// get authentication details from request

function getAuthenticationDetails(req) {

    try {

        let authHeader = req.headers['authorization']
        let token      = authHeader && authHeader.split(' ')[1]

        return { token: token, header: JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString('ascii')) }

    } catch(e) { return null }

}

// get Google API key used to sign the jwt

function getGoogleApiKey(apikey) {
    return new Promise((resolve, reject) => {

        return redis.getEntry(apikey)
        .then(result => {

            // key has been cached
            if (result !== null) { return resolve(result) }

            // key has not been cached
            return getApiKeysFromGoogle()
            .then(result => {

                // missing Google API key = (500)
                if (!result[apikey]) { return reject(500) }

                // cache and set new key
                redis.setEntry(apikey, result[apikey], process.env.REDIS_GOOGLEAPIKEY_SEC)
                return resolve(result[apikey])

            })
            .catch(error => reject(error))

        })
        .catch(error => reject(error))

    })
}

// get missing key directly from Google's API

function getApiKeysFromGoogle() {
    return new Promise((resolve, reject) => {

        return https.get(process.env.GOOGLE_APIS, (response) => {

            let body = ''

            response.setEncoding('utf-8')
            response.on('data',  (chunk) => body += chunk)
            response.on('end',   () => resolve(JSON.parse(body)))

        })
        .on('error', () => reject(500))

    })
}



/* EXPORT MODULES */

module.exports = { validateToken }