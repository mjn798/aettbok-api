// configure imports

const aettbok = require('./aettbok')
const jwt     = require('jsonwebtoken')
const redis   = require('../db/redis')



/* TOKEN VALIDATION */



// validate authentication token

/*
    generic response for any kind of request
    400 (Bad Request)           = no token or invalid token format
    401 (Unauthorized)          = invalid token
    500 (Internal Server Error) = authentication provider or cache issues
*/

async function validateToken(req, res, next) {

    // authentication token and header
    let authenticationDetails = null

    try {

        let authHeader = req.headers['authorization']
        let token      = authHeader && authHeader.split(' ')[1]

        authenticationDetails = { token: token, header: JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString('ascii')) }

    } catch(e) {
        
        // no token or invalid token format = (400)
        return aettbok.sendError(req, res, 400, 'aettbok:validateToken:invalidTokenDetails')

    }

    // get cached key
    redis.getGoogleApiKey(authenticationDetails.header.kid)
    .then(result => jwt.verify(authenticationDetails.token, result, { algorithms: [authenticationDetails.header.alg] }, (error, data) => {

        // invalid token = (401)
        if (error) { return aettbok.sendError(req, res, 401, 'aettbok:validateToken:invalidToken') }

        // store userid (sub[ject]) in request and continue
        req.sub = data.sub
        return next()

    }))
    .catch(error => aettbok.sendError(req, res, error, 'aettbok:validateToken:googleApiKeyError'))

}



/* EXPORT MODULES */

module.exports = {
    validateToken,
}