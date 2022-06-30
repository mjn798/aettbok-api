// configure database connection

const neo4j   = require('neo4j-driver')
const driver  = neo4j.driver(process.env.NEO4J_HOST, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD))



/* GET REQUESTS */



// read all nodes with their relations

function getNodesWithLabel(label) {
    return new Promise((resolve, reject) => {

        let session = driver.session()

        return session
        .readTransaction(tx => tx.run(`MATCH (n1:${label}) OPTIONAL MATCH (n1)-[r]-(n2) RETURN n1, r, n2`))
        .then(result => {

            let nodes = []

            result.records.forEach(record => {

                // check if already in nodes
                let index = nodes.findIndex(e => e.id === record.get('n1').properties.id)

                // if not yet in nodes, push as new node
                if (index < 0) {

                    nodes.push({ ...record.get('n1').properties, relations: [] })
                    index = nodes.length - 1

                }

                // extract relationship and add to node
                let relationship = extractRelationship(record, record.get('n1').identity.low)

                return relationship ? nodes[index].relations.push(relationship) : null

            })

            return resolve(nodes)

        })
        .catch(() => reject(500))
        .finally(() => session.close())

    })
}

// read a specific node and its relations

function getNodeWithLabelAndId(label, id) {
    return new Promise((resolve, reject) => {

        let session = driver.session()

        return session
        .readTransaction(tx => tx.run(`MATCH (n1:${label} { id: $id }) OPTIONAL MATCH (n1)-[r]-(n2) RETURN n1, r, n2`, { id: id }))
        .then(result => {

            // no records = (404)
            if (!result.records.length) { return reject(404) }

            // extract node properties
            let node = { ...result.records[0].get('n1').properties, relations: [] }

            // extract relationships and add to node
            result.records.forEach(record => {

                let relationship = extractRelationship(record)

                return relationship ? node.relations.push(relationship) : null

            })

            return resolve(node)

        })
        .catch(() => reject(500))
        .finally(() => session.close())

    })
}

// extract a single relationship from a given record

function extractRelationship(record) {

    let i = record.get('n1').identity.low
    let n = record.get('n2')
    let r = record.get('r')

    if (!(i && n && r)) { return null }

    return { label: n.labels[0], id: n.properties.id, direction: r.start.low === i ? 'to' : 'from' }

}



/* DELETE REQUESTS */



// delete a node

function deleteNodeWithLabelAndId(label, id) {
    return new Promise((resolve, reject) => {

        let session = driver.session()

        return session
        .run(`MATCH (n:${label} { id: $id }) DETACH DELETE n RETURN n`, { id: id })
        .then(result => {

            // if no node was affected = (404)
            if (result.records.reduce((previous, _record) => (1 + previous), 0) === 0) { return reject(404) }

            // otherwise resolve with no content = (204)
            return resolve(204)

        })
        .catch(() => reject(500))
        .finally(() => session.close)

    })
}



/* RELATIONSHIP REQUESTS */



// put relationship between nodes

function putRelationship(from_id, from_label, to_id, to_label, relation) {
    return new Promise((resolve, reject) => {

        let session = driver.session()

        session
        .run(`MATCH (n1:${from_label} { id: $from }) MATCH (n2:${to_label} { id: $to }) MERGE (n1)-[:${relation}]->(n2) RETURN n1, n2`, { from: from_id, to: to_id })
        .then(result => {

            // if no node was affected = (404)
            if (result.records.reduce((previous, _record) => (1 + previous), 0) === 0) { return reject(404) }

            // otherwise resolve with no content = (204)
            return resolve(204)

        })
        .catch(() => reject(500))
        .finally(() => session.close())

    })
}

// delete relationship between nodes

function deleteRelationship(from_id, from_label, to_id, to_label, relation) {
    return new Promise((resolve, reject) => {

        let session = driver.session()

        session
        .run(`MATCH (n1:${from_label} { id: $from })-[r:${relation}]->(n2:${to_label} { id: $to }) DELETE r RETURN n1, n2`, { from: from_id, to: to_id })
        .then(result => {

            // if no node was affected = (404)
            if (result.records.reduce((previous, _record) => (1 + previous), 0) === 0) { return reject(404) }

            // otherwise resolve with no content = (204)
            return resolve(204)

        })
        .catch(() => reject(500))
        .finally(() => session.close())

    })
}



/* UPSERT AND DELETE REQUESTS */



// upsert a node

function upsertNode(label, id, node, isUpdate) {
    return new Promise((resolve, reject) => {

        // if inserting merge with new node
        // if updating match with existing node

        let method = isUpdate ? 'MATCH' : 'MERGE'

        let session = driver.session()

        session
        .run(`${method} (n1:${label} { id: $id }) SET n1 = $attributes WITH n1 OPTIONAL MATCH (n1)-[r]-(n2) RETURN n1, r, n2`, { id: id, attributes: { id: id, ...node } })
        .then(result => {

            // id was not found = (404)
            if (!result.records.length) { return reject(404) }

            // extract node properties
            let node = { ...result.records[0].get('n1').properties, relations: [] }

            // extract internal identity
            let identity = result.records[0].get('n1').identity.low

            // extract relationships and add to node
            result.records.forEach(record => {

                let relationship = extractRelationship(record, identity)
                if (!relationship) { return }
                return node.relations.push(relationship)

            })

            return resolve(node)

        })
        .catch(() => reject(500))
        .finally(() => session.close())

    })
}



/* MODULE EXPORTS */

module.exports = {
    deleteNodeWithLabelAndId,
    deleteRelationship,
    getNodesWithLabel,
    getNodeWithLabelAndId,
    putRelationship,
    upsertNode,
}