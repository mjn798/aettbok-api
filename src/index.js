// configure environment variables

require('dotenv/config')

// configure imports

const aettbok     = new (require('./common/aettbok'))()
const compression = require('compression')
const express     = require('express')
const jwt         = require('jsonwebtoken')

const port        = process.env.SERVER_PORT || 3000

// public keys for token validation

let publicKeys = { }

// configure application
// case sensitive routes
// use json by default
// use compression - expects "Accept-Encoding: gzip" header
//                 - default compression threshold: 1 kb

const app = express()

app.disable('x-powered-by')
app.set('case sensitive routing', true)
app.use(express.json())
app.use(compression())



// configure routes

app.delete('/:label/:id',           validateToken, (req, res) => aettbok.deleteNodeWithLabelAndId(req, res))
app.delete('/:label/:id/Relations', validateToken, (req, res) => aettbok.deleteRelationship(req, res))
app.get('/:label',                  validateToken, (req, res) => aettbok.getNodesWithLabel(req, res))
app.get('/:label/:id',              validateToken, (req, res) => aettbok.getNodeWithLabelAndId(req, res))
app.get('/:label/:id/Relations',    validateToken, (req, res) => aettbok.getNodeWithLabelAndId(req, res, 'relations'))
app.post('/:label',                 validateToken, (req, res) => aettbok.postNodeInsert(req, res))
app.post('/:label/:id',             validateToken, (req, res) => aettbok.postNodeUpdate(req, res))
app.put('/:label/:id/Relations',    validateToken, (req, res) => aettbok.putRelationship(req, res))



// validate access token
// if success, continue with next function in original call

/*
    400 (Bad Request)           = no valid token
    401 (Unauthorized)          = invalid token
    403 (Forbidden)             = invalid permissions
    500 (Internal Server Error) = invalid or missing key id
*/

async function validateToken(req, res, next) {

    let authenticationDetails = aettbok.getAuthenticationDetails(req)

    // missing or incorrect token header = (400)
    if (authenticationDetails === null) { console.error('jwt:validateToken:InvalidTokenHeader', 400); return res.status(400).send() }

    // if provided key is unknown, load from Google API and validate token
    if (!publicKeys[authenticationDetails.header.kid]) {

        await aettbok.getGoogleApiKeys()
        .then(result => publicKeys = result)
        .catch(error => { console.error('jwt:validateToken:InvalidPublicKey', error); return res.status(error).send() })

    }

    return jwt.verify(authenticationDetails.token, publicKeys[authenticationDetails.header.kid], { algorithms: [authenticationDetails.header.alg] }, (error, data) => {

        // invalid token = (401)
        if (error) { console.error('jwt:validateToken:InvalidToken', 401); return res.status(401).send() }

        // GET needs read permissions
        // POST, PUT and DELETE need write permissions
        // if ((['GET'].includes(req.method) && (!data.user.roles.includes('read'))) || (['POST', 'PUT', 'DELETE'].includes(req.method) && (!data.user.roles.includes('write')))) { console.debug('jwt:validateToken:InvalidAccess', req.method, data.user, 403); return res.status(403).send() }

        // otherwise token is verified
        // remember userid and continue with next function of original call
        req.sub = data.sub
        return next()

    })

}



// start server and listen to incoming request

app.listen(port, () => console.info(`Server running on port ${port}`))