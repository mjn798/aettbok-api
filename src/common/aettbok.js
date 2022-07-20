// configure imports

const db    = require('../db/neo4j')
const redis = require('../db/redis')
const jwt   = require('jsonwebtoken')

// configure default mappings

const allowedLabels = new Set(['Document', 'Event', 'Location', 'LocationType', 'Person', 'Source', 'Tag'])



/* GENERIC FUNCTIONS */



// check if given id is valid (exactly 22 word characters)

function isValidNodeId(id) { return (id !== undefined) && (id.match(/^\w{22}$/)) }

// check if given label is valid (in list)

function isValidLabel(label) { return allowedLabels.has(label) }

// log error message and send error

function sendError(req, res, status, message) {
    console.error(message, status, req.sub)
    return res.status(status).send()
}

// log debug message and send result

function sendResult(req, res, status, payload, message) {
    console.debug(message, status, req.sub)
    return res.status(status).send(payload)
}



/* TOKEN VALIDATION */



// validate authentication token

/*
    generic response for any kind of request
    400 (Bad Request)           = no token or invalid token format
    401 (Unauthorized)          = invalid token
    500 (Internal Server Error) = authentication provider or cache issues
*/

async function validateToken(req, res, next) {

    // CORS policy

    res.header("Access-Control-Allow-Origin", "http://localhost:8080")
    res.header("Access-Control-Allow-Methods", "DELETE, GET, POST")
    res.header("Access-Control-Allow-Headers", "Accept-Encoding, Accept, Authorization, Content-Type")

    // authentication token and header
    let authenticationDetails = null

    try {

        let authHeader = req.headers['authorization']
        let token      = authHeader && authHeader.split(' ')[1]

        authenticationDetails = { token: token, header: JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString('ascii')) }

    } catch(e) {
        
        // no token or invalid token format = (400)
        return sendError(req, res, 400, 'aettbok:validateToken:invalidTokenDetails')

    }

    // get cached key
    let authenticationKey = await redis.getGoogleApiKey(authenticationDetails.header.kid)

    // authentication key error = (?)
    if (authenticationKey.error) { return sendError(req, res, authenticationKey.error, 'aettbok:validateToken:googleApiKeyError')}

    // verify token against key
    return jwt.verify(authenticationDetails.token, authenticationKey.key, { algorithms: [authenticationDetails.header.alg]}, (error, data) => {

        // invalid token = (401)
        if (error) { return sendError(req, res, 401, 'aettbok:validateToken:invalidToken') }

        // store userid (sub[ject]) in request and continue
        req.sub = data.sub
        return next ()

    })

}



/* GET REQUESTS */



// get nodes matching given label

/*
    200 (OK)                    = success, return JSON
    404 (Not Found)             = unknown label
    500 (Internal Server Error) = database or cache issues
*/

async function getNodesWithLabel(req, res) {

    let { label } = req.params

    // unknown label = (404)
    if (!isValidLabel(label)) { return sendError(req, res, 404, `aettbok:getNodesWithLabel:unknownLabel ${label}`) }

    return redis.getEntry(label)
    .then(node => {

        // return cached result = (200)
        if (node) { return sendResult(req, res, 200, node, `aettbok:getNodeWithLabel:cache ${label}`) }

        // get from neo4j
        db.getNodesWithLabel(label)
        .then(nodes => {

            redis.setEntry(label, nodes)

            return sendResult(req, res, 200, nodes, `aettbok:getNodeWithLabel:database ${label}`)

        })
        .catch(error => sendError(req, res, error, `aettbok:getNodesWithLabel:database ${label}`))

    })
    .catch(error => sendError(req, res, error, `aettbok:getNodesWithLabel:cache ${label}`))

}

// get specific node matching given label and id

/*
    200 (OK)                    = success, return JSON
    404 (Not Found)             = unknown label or id
    500 (Internal Server Error) = database or cache issues
*/

async function getNodeWithLabelAndId(req, res) {

    let { label, id } = req.params

    // unknown label or invalid id = (404)
    if (!(isValidLabel(label) && isValidNodeId(id))) { return sendError(req, res, 404, `aettbok:getNodeWithLabelAndId:unknownLabelOrId ${label} ${id}`) }

    return redis.getEntry(`${label}:${id}`)
    .then(node => {

        // return cached result = (200)
        if (node) { return sendResult(req, res, 200, node, `aettbok:getNodeWithLabelAndId:cache ${label} ${id}`) }

        // get from neo4j
        db.getNodeWithLabelAndId(label, id)
        .then(node => {

            redis.setEntry(`${label}:${id}`, node)

            return sendResult(req, res, 200, node, `aettbok:getNodeWithLabelAndId:database ${label} ${id}`)

        })
        .catch(error => sendError(req, res, error, `aettbok:getNodeWithLabelAndId:database ${label} ${id}`))

    })
    .catch(error => sendError(req, res, error, `aettbok:getNodeWithLabelAndId:cache ${label} ${id}`))

}



/* DELETE REQUESTS */



// delete a node and remove all of its relationships

/*
    204 (No Content)            = success
    404 (Not Found)             = unknown label or id
    500 (Internal Server Error) = database or cache issues
*/

async function deleteNodeWithLabelAndId(req, res) {

    let { label, id } = req.params

    // unknown label or invalid id = (404)
    if (!(isValidLabel(label) && isValidNodeId(id))) { return sendError(req, res, 404, `aettbok:deleteNodeWithLabelAndId:unknownLabelOrId ${label} ${id}`)}

    return db.deleteNodeWithLabelAndId(label, id)
    .then(result => {

        redis.deleteEntry(`${label}`)
        redis.deleteEntry(`${label}:${id}`)

        return sendResult(req, res, result, null, `aettbok:deleteNodeWithLabelAndId ${label}:${id}`)

    })
    .catch(error => sendError(req, res, error, `aettbok:deleteNodeWithLabelAndId ${label}:${id}`))

}



/* UPSERT REQUESTS */



// create a node

/*
    200 (OK)                    = success, returning JSON
    400 (Bad Request)           = failed field validation or id present
    404 (Not Found)             = unknown label
    500 (Internal Server Error) = database or cache issues
*/

function postNodeInsert(req, res) {

    let { id } = req.params

    // valid id = (400)
    if (id) { return sendError(req, res, 400, `aettbok:postNodeInsert:hasIdInCreate ${id}`)}

    // generate a new random uuid
    req.params.id = require('short-uuid').generate()

    // treat like an update
    return this.postNodeUpdate(req, res, false)

}

// update a node

/*
    fields with value 'null' will be removed by the FieldValidator
    only certain fields are allowed to be nullable in FieldValidator
*/

/*
    200 (OK)                    = success, returning JSON
    400 (Bad Request)           = failed field validation
    404 (Not Found)             = unknown label or id
    500 (Internal Server Error) = database or cache issues
*/

function postNodeUpdate(req, res, isUpdate = true) {

    let { label, id } = req.params

    // unknown label or invalid id = (400)
    if (!(isValidLabel(label) && isValidNodeId(id))) { return sendError(req, res, 404, `aettbok:postNodeUpdate:unknownLabelOrId ${label} ${id}`)}

    // validate body and all required fields
    let fv = require('./fieldvalidator').validateFields(label, req.body)
    if (fv.error) { return sendError(req, res, fv.error, `aettbok:postNodeUpdate:fieldValidation`)}

    return db.upsertNode(label, id, fv, isUpdate)
    .then(result => {

        redis.deleteEntry(`${label}`)
        redis.setEntry(`${label}:${id}`, result)

        return sendResult(req, res, 200, result, `aettbok:postNodeUpdate ${label}:${id}`)

    })
    .catch(error => sendError(req, res, error, `aettbok:postNodeUpdate ${label}:${id}`))

}



/* EXPORT MODULES */

module.exports = {
    deleteNodeWithLabelAndId,
    getNodesWithLabel,
    getNodeWithLabelAndId,
    postNodeInsert,
    postNodeUpdate,
    validateToken,
}