// configure imports

const db    = require('../db/neo4j')
const redis = require('../db/redis')
const jwt   = require('jsonwebtoken')

// configure default mappings

const allowedLabels = new Set(['Document', 'Event', 'Location', 'LocationType', 'Person', 'Sources', 'Tag'])

const singularRelationshipType = new Map()
singularRelationshipType.set('Document>Event',         'DOCUMENTS')
singularRelationshipType.set('Document>Location',      'DOCUMENTS')
singularRelationshipType.set('Document>Person',        'DOCUMENTS')
singularRelationshipType.set('Document>Tag',           'TAGGED')
singularRelationshipType.set('Event>Location',         'WASIN')
singularRelationshipType.set('Event>Tag',              'TAGGED')
singularRelationshipType.set('Location>Location',      'PARTOF')
singularRelationshipType.set('Location>LocationType',  'LOCATIONTYPE')
singularRelationshipType.set('Location>Tag',           'TAGGED')
singularRelationshipType.set('Person>Event',           'ATTENDED')
singularRelationshipType.set('Person>Person',          'HASPARENT')
singularRelationshipType.set('Person>Tag',             'TAGGED')
singularRelationshipType.set('Source>Document',        'SOURCES')
singularRelationshipType.set('Source>Location',        'STOREDIN')
singularRelationshipType.set('Source>Tag',             'TAGGED')



/* GENERIC FUNCTIONS */



// check if given id is valid (exactly 22 word characters)

function isValidNodeId(id) { return (id !== undefined) && (id.match(/^\w{22}$/)) }

// check if given label is valid (in list)

function isValidLabel(label) { return (label !== undefined) && (allowedLabels.has(label)) }

// get singular relations for types

function getSingularRelationshipType(from, to) { return singularRelationshipType.get(`${from}>${to}`) }

// log error message and send back result

function sendError(req, res, status, message) {
    console.error(message, status, req.sub)
    return res.status(status).send()
}

// log debug message and send back result

function sendResult(req, res, status, payload, message) {
    console.debug(message, status, req.sub)
    return res.status(status).send(payload)
}



/* TOKEN VALIDATION */



// validate authentication token

/*
    400 (Bad Request)           = no token or invalid token format
    401 (Unauthorized)          = invalid token
    500 (Internal Server Error) = Google / Redis issues
*/

async function validateToken(req, res, next) {

    let authenticationDetails = getAuthenticationDetails(req)

    // no token or invalid token format = (400)
    if (authenticationDetails === null || !authenticationDetails.token || !authenticationDetails.header || !authenticationDetails.header.kid || !authenticationDetails.header.alg) { return sendError(req, res, 400, 'aettbok:validateToken:invalidTokenDetails') }

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

// extract token and authentication header from request

function getAuthenticationDetails(req) {

    let authHeader = req.headers['authorization']
    let token      = authHeader && authHeader.split(' ')[1]

    try { return { token: token, header: JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString('ascii'))} }
    catch(error) { return null }

}



/* GET REQUESTS */



// get nodes matching given label

/*
    200 (OK)                    = success, return JSON
    400 (Bad Request)           = invalid id, invalid label
    500 (Internal Server Error) = Neo4J / Redis issues
*/

async function getNodesWithLabel(req, res) {

    let { label } = req.params

    // unknown label = (400)
    if (!(isValidLabel(label))) { return sendError(req, res, 400, `aettbok:getNodesWithLabel:validation ${label}`) }

    // get nodes from cache or database
    let result = await redis.getNodesWithLabel(label)

    // node error = (?)
    if (result.error) { return sendError(req, res, result.error, `aettbok:getNodesWithLabel:getNodesFromRedis ${label}`)}

    return sendResult(req, res, 200, result, `aettbok:getNodesWithLabel ${label}`)

}

// get specific node matching given label and id

/*
    200 (OK)                    = success, return JSON
    400 (Bad Request)           = invalid id, invalid label
    404 (Not Found)             = unknown id
    500 (Internal Server Error) = Neo4J / Redis issues
    501 (Not Implemented)       = attribute not implemented
*/

async function getNodeWithLabelAndId(req, res) {

    let { label, id } = req.params

    // unknown label or invalid id = (400)
    if (!(isValidLabel(label) && isValidNodeId(id))) { return sendError(req, res, 400, `aettbok:getNodeWithLabelAndId:validation ${label} ${id}`) }

    // get node from cache or database
    let result = await redis.getNodeWithLabelAndId(label, id)

    // node error = (?)
    if (result.error) { return sendError(req, res, result.error, `aettbok:getNodeWithLabelAndId:getNodeFromRedis ${label} ${id}`) }

    return sendResult(req, res, 200, result, `aettbok:getNodeWithLabelAndId ${label} ${id}`)

}



/* RELATIONSHIP REQUESTS */



// qualifies a relationship between nodes and returns either relationship-object or error

function qualifyRelationship(req) {

    // the request parameters (label & id) are always the FROM nodes
    // the body parameters (label & id) are always the TO nodes

    let { label, id } = req.params
    let to_label      = req.body.label
    let to_id         = req.body.id

    // unknown labels or invalid ids = (400)
    if (!(isValidLabel(label) && isValidLabel(to_label) && isValidNodeId(id) && isValidNodeId(to_id) && (id !== to_id))) { return { error: 400 }}

    // no defined relationship = (405)
    let relation = getSingularRelationshipType(label, to_label)
    if (relation === undefined) { return { error: 405 }}

    return { from_id: id, from_label: label, to_id: to_id, to_label: to_label, relation: relation }

}

// create relationship between nodes

/*
    204 (No Content)            = success
    400 (Bad Request)           = unknown label in header or body, invalid id in header or body
    404 (Not Found)             = unknown node id in header or body
    405 (Method Not Allowed)    = unknown relationship between nodes
    500 (Internal Server Error) = Neo4J issues
*/

function putRelationship(req, res) {

    let r = qualifyRelationship(req, res)

    if (r.error) { return sendError(req, res, r.error, `aettbok:putRelationship ${r}`)}

    return db.putRelationship(r.from_id, r.from_label, r.to_id, r.to_label, r.relation)
    .then(result => {

        // delete cache for labels and individual ids
        redis.deleteEntry(`${r.to_label}`)
        redis.deleteEntry(`${r.from_label}`)
        redis.deleteEntry(`${r.to_label}:${r.to_id}`)
        redis.deleteEntry(`${r.from_label}:${r.from_id}`)

        return sendResult(req, res, result, null, `aettbok:putRelationship ${r.from_label}:${r.from_id} > ${r.to_label}:${r.to_id}`)

    })
    .catch(error => sendError(req, res, error, `aettbok:putRelationship ${r.from_label}:${r.from_id} > ${r.to_label}:${r.to_id}`))


}

// delete relationship between nodes

/*
    204 (No Content)            = success
    400 (Bad Request)           = unknown label in header or body, invalid id in header or body
    404 (Not Found)             = unknown node id in header or body
    405 (Method Not Allowed)    = unknown relationship between nodes
    500 (Internal Server Error) = Neo4J issues
*/

function deleteRelationship(req, res) {

    let r = qualifyRelationship(req)

    if (r.error) { return sendError(req, res, r.error, `aettbok:deleteRelationship ${r}`) }

    return db.deleteRelationship(r.from_id, r.from_label, r.to_id, r.to_label, r.relation)
    .then(result => {

        // delete cache for labels and individual ids
        redis.deleteEntry(`${r.to_label}`)
        redis.deleteEntry(`${r.from_label}`)
        redis.deleteEntry(`${r.to_label}:${r.to_id}`)
        redis.deleteEntry(`${r.from_label}:${r.from_id}`)

        return sendResult(req, res, result, null, `aettbok:deleteRelationship ${r.from_label}:${r.from_id} > ${r.to_label}:${r.to_id}`)

    })
    .catch(error => sendError(req, res, error, `aettbok:deleteRelationship ${r.from_label}:${r.from_id} > ${r.to_label}:${r.to_id}`))

}



/* EXPORT MODULES */

module.exports = {
    deleteRelationship,
    getNodesWithLabel,
    getNodeWithLabelAndId,
    putRelationship,
    validateToken,
}