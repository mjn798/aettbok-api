// configure imports and defaults

const db    = require('../db/neo4j')
const redis = require('../db/redis')

const allowedLabels = new Set(['Document', 'Event', 'Location', 'LocationType', 'Person', 'Source', 'Tag'])



/* GENERIC FUNCTIONS */



// check if given id is valid (exactly 22 word characters) and if given label is valid (in set)

const isValidNodeId = id    => (id !== undefined) && (id.match(/^\w{22}$/))
const isValidLabel  = label => allowedLabels.has(label)

// log and send results and errors

function sendError(req, res, status, message)           { return res.status(status).send()        && console.error(message, status, req.sub) }
function sendResult(req, res, status, payload, message) { return res.status(status).send(payload) && console.debug(message, status, req.sub) }



/* GET REQUESTS */



// get nodes matching given label

/*
    200 (OK)                    = success, return JSON
    404 (Not Found)             = unknown label or id
    500 (Internal Server Error) = database or cache issues
*/

function getNodes(req, res) {

    let { label, id } = req.params

    // unknown label = (404)
    if (!isValidLabel(label)) { return sendError(req, res, 404, `aettbok:getNodes:unknownLabel ${label}`) }

    // given id, but invalid = (404)
    if (!id) { id = null }
    if (id && !isValidNodeId(id)) { return sendError(req, res, 404, `aettbok:getNodes:invalidId ${label} ${id}`) }

    let key = id === null ? label : `${label}:${id}`

    return redis.getEntry(key)
    .then(node => {

        // return cached result = (200)
        if (node) { return sendResult(req, res, 200, node, `aettbok:getNodes:cache ${key}`)}

        // get from database
        return db.getNodes(label, id)
        .then(nodes => {
            redis.setEntry(key, nodes)
            return sendResult(req, res, 200, nodes, `aettbok:getNodes:database ${key}`)
        })
        .catch(error => sendError(req, res, error, `aettbok:getNodes:database ${key}`))

    })
    .catch(error => sendError(req, res, error, `aettbok:getNodes:cache ${key}`))
}



/* DELETE REQUESTS */



// delete a node and remove all of its relationships

/*
    204 (No Content)            = success
    404 (Not Found)             = unknown label or id
    500 (Internal Server Error) = database or cache issues
*/

function deleteNode(req, res) {

    let { label, id } = req.params

    // unknown label or invalid id = (404)
    if (!(isValidLabel(label) && isValidNodeId(id))) { return sendError(req, res, 404, `aettbok:deleteNode:unknownLabelOrId ${label} ${id}`)}

    return db.deleteNodeWithLabelAndId(label, id)
    .then(result => {

        // if node is part of other nodes' relations, this will not be updated in the cache - yet

        redis.deleteEntry(`${label}`)
        redis.deleteEntry(`${label}:${id}`)

        return sendResult(req, res, result, null, `aettbok:deleteNode ${label}:${id}`)

    })
    .catch(error => sendError(req, res, error, `aettbok:deleteNode ${label}:${id}`))

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
    deleteNode,
    getNodes,
    postNodeInsert,
    postNodeUpdate,
    sendError,
}