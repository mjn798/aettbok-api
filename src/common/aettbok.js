// require database function

const db = new (require('../db/neo4j'))()



class AettbokFunctions {

    constructor() {

        this.allowedLabels = new Set(['Document', 'Event', 'Location', 'LocationType', 'Person', 'Sources', 'Tag'])

        this.singularRelationshipType = new Map()
        this.singularRelationshipType.set('Document>Event',         'DOCUMENTS')
        this.singularRelationshipType.set('Document>Location',      'DOCUMENTS')
        this.singularRelationshipType.set('Document>Person',        'DOCUMENTS')
        this.singularRelationshipType.set('Document>Tag',           'TAGGED')
        this.singularRelationshipType.set('Event>Location',         'WASIN')
        this.singularRelationshipType.set('Event>Tag',              'TAGGED')
        this.singularRelationshipType.set('Location>Location',      'PARTOF')
        this.singularRelationshipType.set('Location>LocationType',  'LOCATIONTYPE')
        this.singularRelationshipType.set('Location>Tag',           'TAGGED')
        this.singularRelationshipType.set('Person>Event',           'ATTENDED')
        this.singularRelationshipType.set('Person>Person',          'HASPARENT')
        this.singularRelationshipType.set('Person>Tag',             'TAGGED')
        this.singularRelationshipType.set('Source>Document',        'SOURCES')
        this.singularRelationshipType.set('Source>Location',        'STOREDIN')
        this.singularRelationshipType.set('Source>Tag',             'TAGGED')

    }



    /* GENERIC FUNCTIONS */



    // check if given id is valid (exactly 22 word characters)

    isValidNodeId(id) { return (id !== undefined) && (id.match(/^\w{22}$/)) }

    // check if given label is valid (in list)

    isValidLabel(label) { return (label !== undefined) && (this.allowedLabels.has(label)) }

    // get singular relations for types

    getSingularRelationshipType(from, to) { return this.singularRelationshipType.get(`${from}>${to}`) }



    /* AUTHENTICATION FUNCTIONS */



    // get token and auth-header from request

    getAuthenticationDetails(req) {

        let authHeader = req.headers['authorization']
        let token      = authHeader && authHeader.split(' ')[1]

        // extract token header or fail with null
        try { return { token: token, header: JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString('ascii'))} }
        catch(error) { return null }
    
    }

    // get Google API Keys for JWT validation

    getGoogleApiKeys() {
        return new Promise((resolve, reject) => {

            console.debug('aettbok:getGoogleApiKeys')

            const https = require('https')

            https.get('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', (response) => {

                let body = ''

                response.setEncoding('utf-8')
                response.on('data', (chunk) => { body += chunk })
                response.on('end', () => resolve(JSON.parse(body)))

            })
            .on('error', () => reject(500))

        })
    }



    /* GET requests */



    // get nodes of given type - generic to all GET routes

    /*
        200 (OK)                    = success, return JSON
        400 (Bad Request)           = unknown label
        500 (Internal Server Error) = error during query execution or result processing
    */

    getNodesWithLabel(req, res) {

        let { label } = req.params

        // unknown label = (400)
        if (!this.isValidLabel(label)) { console.error('aettbok:getNodesWithLabel', req.sub, label, 400); return res.status(400).send() }

        db.getNodesWithLabel(label)
        .then(result => { console.debug('aettbok:getNodesWithLabel', req.sub, label, 200); return res.status(200).send(result) })
        .catch(error => { console.error('aettbok:getNodesWithLabel', req.sub, label, error); return res.status(error).send() })

    }

    // get specific node of given type and id - generic to all GET routes

    /*
        200 (OK)                    = success, return JSON
        400 (Bad Request)           = unknown label, invalid id
        404 (Not Found)             = unknown id, id / label mismatch
        500 (Internal Server Error) = error during query execution or result processing
        501 (Not Implemented)       = internal attribute not implemented
    */

    getNodeWithLabelAndId(req, res, attribute = null) {

        let { label, id } = req.params

        // unknown label or invalid id = (400)
        if (!(this.isValidLabel(label) && this.isValidNodeId(id))) { console.error('aettbok:getNodeWithLabelAndId', req.sub, label, id, attribute, 400); return res.status(400).send() }

        db.getNodeWithLabelAndId(label, id)
        .then(result => {

            // no attribute, send full result = (200)
            if (attribute === null) { console.debug('aettbok:getNodeWithLabelAndId', req.sub, label, id, attribute, 200); return res.status(200).send(result) }

            // attribute not implemented in result = (501)
            if (result[attribute] === undefined) { console.error('aettbok:getNodeWithLabelAndId', req.sub, label, id, attribute, 501); return res.status(501).send() }

            // known attribute, send as result = (200)
            console.debug('aettbok:getNodeWithLabelAndId', req.sub, label, id, attribute, 200); return res.status(200).send(result[attribute])

        })
        .catch(error => { console.error('aettbok:getNodeWithLabelAndId', req.sub, label, id, attribute, error); return res.status(error).send() })

    }



    /* DELETE requests */



    // delete a node of given type and id and all its relationships - generic to all node DELETE routes

    /*
        204 (No Content)            = success
        400 (Bad Request)           = unknown label, invalid id
        404 (Not Found)             = unknown id / label combination
        500 (Internal Server Error) = error during query execution or result processing
    */

    deleteNodeWithLabelAndId(req, res) {

        let { label, id } = req.params

        // unknown label or invalid id = (400)
        if (!(this.isValidLabel(label) && this.isValidNodeId(id))) { console.error('aettbok:deleteNodeWithLabelAndId', req.sub, label, id, attribute, 400); return res.status(400).send() }

        db.deleteNodeWithLabelAndId(label, id)
        .then(result => { console.error('aettbok:deleteNodeWithLabelAndId', req.sub, label, id, result); return res.status(result).send() })
        .catch(error => { console.error('aettbok:deleteNodeWithLabelAndId', req.sub, label, id, error); return res.status(error).send() })

    }



    /* POST requests */



    // create a node by generating a new uuid

    /*
        200 (OK)                    = success, returning node object
        400 (Bad Request)           = unknown label or invalid id, failed field validation
        500 (Internal Server Error) = error during query execution or result processing
    */

    postNodeInsert(req, res) {

        let { id } = req.params

        // valid id not allowed during creation = (409)
        if (id !== undefined) { console.error('aettbok:postNodeCreate:id', req.sub, id, 409); return res.status(409).send() }

        req.params.id = require('short-uuid').generate()

        // after id creation, treat like an update

        return this.postNodeUpdate(req, res, false)

    }

    // update a node

    /*
        fields with value 'null' will be removed from the node
        only certain fields are allowed to be nullable in FieldValidataor
    */

    /*
        200 (OK)                    = success, returning node object
        400 (Bad Request)           = unknown label or invalid id, failed field validation
        404 (Not Found)             = updating id for label does not exist
        500 (Internal Server Error) = error during query execution or result processing
    */

    postNodeUpdate(req, res, isUpdate = true) {

        let { label, id } = req.params

        // unknown label or invalid id = (400)
        if (!(this.isValidLabel(label) && this.isValidNodeId(id))) { console.error('aettbok:postNodeUpdate', req.sub, label, id, 400); return res.status(400).send() }

        // validate the body and return error, if not all fields are present / correct type

        let fv = new (require('./fieldvalidator'))().validateFields(label, req.body)
        if (fv.error) { console.error('aettbok:postNodeUpdate', req.sub, label, id, fv.error); return res.status(fv.error).send() }

        db.upsertNodeWithLabelAndId(label, id, fv, isUpdate)
        .then(result => {

            let node = { label: label, id: id, ...result }

            console.debug('aettbok:postNodeUpdate', req.sub, label, id, 200); return res.status(200).send(node)

        })
        .catch(error => { console.error('aettbok:postNodeUpdate', req.sub, label, id, error); return res.status(error).send() })

    }



    /* RELATIONSHIP requests */



    // qualifies a relationship between nodes and return an object with either and error code or the relationship

    qualifyRelationship(req) {

        // the request parameters (type & id) are always the FROM nodes
        // the body parameters (label & id) are always the TO nodes
        
        // the relationship is created from the called URI to the JSON(body) resource

        let { label, id } = req.params
        let to_id         = req.body.id
        let to_label      = req.body.label

        // unknown labels or invalid ids = (400)
        if (!(this.isValidLabel(label) && this.isValidLabel(to_label) && this.isValidNodeId(id) && this.isValidNodeId(to_id) && (id !== to_id))) { return { error: 400 } }

        // no defined relationship between labels = (405)
        let relation = this.getSingularRelationshipType(label, to_label)
        if (relation === undefined) { return { error: 405 } }

        return { from_id: id, from_label: label, to_id: to_id, to_label: to_label, relation: relation }

    }

    // create a relationship between two nodes

    /*
        204 (No Content)            = (idempotent) success
        400 (Bad Request)           = unknown label or to_label, invalid id or to_id, id equals to_id
        404 (Not Found)             = unknown to_id & to_label combination
        405 (Method Not Allowed)    = unknown relationship between types
        500 (Internal Server Error) = error during query execution or result processing
    */

    putRelationship(req, res) {

        let r = this.qualifyRelationship(req)

        // forward error if in qualifyRelationship = (?)
        if (r.error) { console.error('aettbok:putRelationship', req.sub, r.error); return res.status(r.error).send() }

        db.putRelationship(r.from_id, r.from_label, r.to_id, r.to_label, r.relation)
        .then(result => { console.debug('aettbok:putRelationship', req.sub, r.from_label, r.from_id, '>', r.to_label, r.to_id, result); return res.status(result).send() })
        .catch(error => { console.error('aettbok:putRelationship', req.sub, r.from_label, r.from_id, '>', r.to_label, r.to_id, error); return res.status(error).send() })

    }

    // delete a relationship between two nodes

    /*
        204 (No Content)            = success
        400 (Bad Request)           = unknown label or to_label, invalid id or to_id, id equals to_id
        404 (Not Found)             = unknown to_id & to_label combination, no present relationship
        405 (Method Not Allowed)    = unknown relationship between types
        500 (Internal Server Error) = error during query execution or result processing
    */

    deleteRelationship(req, res) {

        let r = this.qualifyRelationship(req)

        // forward error if in qualifyRelationship = (?)
        if (r.error) { console.error('aettbok:deleteRelationship', req.sub, r.error); return res.status(r.error).send() }

        db.deleteRelationship(r.from_id, r.from_label, r.to_id, r.to_label, r.relation)
        .then(result => { console.debug('aettbok:deleteRelationship', req.sub, r.from_label, r.from_id, '>', r.to_label, r.to_id, result); return res.status(result).send() })
        .catch(error => { console.error('aettbok:deleteRelationship', req.sub, r.from_label, r.from_id, '>', r.to_label, r.to_id, error); return res.status(error).send() })

    }

}

module.exports = AettbokFunctions