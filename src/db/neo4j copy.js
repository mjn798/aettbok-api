// configure database connection

const neo4j   = require('neo4j-driver')
const driver  = neo4j.driver(process.env.NEO4J_HOST, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD))

// cache will be cleared on any modification - PUT, DELETE
// cache will be updated on any node upserts - POST

const nodeCache = new Map()



class DatabaseProvider {

    constructor() { }

    getNodesWithLabel(label) {
        return new Promise((resolve, reject) => {

            // if exists, return cache for label

            let tempResult = Array.from(nodeCache.values()).filter(e => e.label === label)

            if (tempResult.length) { return resolve(tempResult) }

            // otherwise build the cache for label

            let session = driver.session()

            session
            .readTransaction(tx => tx.run(`MATCH (n1:${label}) OPTIONAL MATCH (n1)-[r]-(n2) RETURN n1, r, n2`))
            .then(result => {

                result.records.forEach(record => {

                    // extract the nodes, relationship and internal identity

                    let n1 = record.get('n1')
                    let n2 = record.get('n2')
                    let r  = record.get('r')

                    let n1InternalId = Number(n1.identity.low)

                    // if no internal id (not a finite number), there was something wrong in the resultset = (500)
                    // cache might be poisoned - clear it!

                    if (!Number.isFinite(n1InternalId)) {

                        nodeCache.clear()

                        return reject(500)

                    }

                    // if node is not cached, cache it

                    if (nodeCache.get(n1.properties.id) === undefined) {

                        nodeCache.set(n1.properties.id, { label: record.get('n1').labels[0], ...record.get('n1').properties, relations: [] })

                    }

                    // cache relations, if relation and 2nd node is present

                    if (r && n2) {

                        // get the node from cache and set its relations - to/from depending on interal start id of the relation

                        let node = nodeCache.get(n1.properties.id)

                        if (r.start.low === n1InternalId)    { node.relations.push({ type: r.type, to: n2.properties.id }) }
                        else if (r.end.low === n1InternalId) { node.relations.push({ type: r.type, from: n2.properties.id }) }

                        // set updated node back into cache

                        nodeCache.set(n1.properties.id, node)

                    }

                })

                // return arrayfied cache filtered by type

                return resolve(Array.from(nodeCache.values()).filter(e => e.label === label))

            })
            .catch(error => { console.error('neo4j:getNodesWithType', label, error); return reject(500) })
            .finally(() => session.close())

        })
    }

    getNodeWithLabelAndId(label, id) {
        return new Promise((resolve, reject) => {

            // check if the id and type is cached and return node
            // if node is cached, but type does not match = (404)

            let node = nodeCache.get(id)

            if (node) { return (node.label === label) ? resolve(node) : reject(404) }

            // if node is not cached, (re) build a cache of all nodes

            this.getNodesWithLabel(label)
            .then(() => {

                let node = nodeCache.get(id)

                // return resulting node
                // if no node matches for label = (404)

                return (node && node.label === label) ? resolve(node) : reject(404)

            })
            .catch(error => { console.error('neo4j:getNodeWithTypeAndId', label, id, error); return reject(500) })

        })
    }

    putRelationship(from_id, from_label, to_id, to_label, relation) {
        return new Promise((resolve, reject) => {

            let session = driver.session()

            session
            .run(`MATCH (n1:${from_label} { id: $from }) MATCH (n2:${to_label} { id: $to }) MERGE (n1)-[:${relation}]->(n2) RETURN n1, n2`, { from: from_id, to: to_id })
            .then(result => {

                // check if there was an actual node affected, if not n2 was not found (404)

                if (result.records.reduce((previous, _record) => (1 + previous), 0) === 0) { return reject(404) }

                // after a successful update, the cache should be cleared = No Content [needed in response] (204)

                nodeCache.clear()

                return resolve(204)

            })
            .catch(error => { console.error('neo4j:putRelationship', from_label, from_id, '>', to_label, to_id, error); return reject(500) })
            .finally(() => session.close())

        })
    }

    deleteRelationship(from_id, from_label, to_id, to_label, relation) {
        return new Promise((resolve, reject) => {

            let session = driver.session()

            session
            .run(`MATCH (n1:${from_label} { id: $from }) MATCH (n2:${to_label} { id: $to }) MATCH (n1)-[r:${relation}]->(n2) DELETE r RETURN n1, n2`, { from: from_id, to: to_id })
            .then(result => {

                // if no node was affected = (404)

                if (result.records.reduce((previous, _record) => (1 + previous), 0) === 0) { return reject(404) }

                // after a successful update, the cache should be cleared = No Content [needed in response] (204)

                nodeCache.clear()

                return resolve(204)

            })
            .catch(error => { console.error('neo4j:putRelationship', from_label, from_id, '>', to_label, to_id, error); return reject(500) })
            .finally(() => session.close())

        })
    }

    deleteNodeWithLabelAndId(label, id) {
        return new Promise((resolve, reject) => {

            let session = driver.session()

            session
            .run(`MATCH (n:${label} { id: $id }) DETACH DELETE n RETURN n`, { id: id })
            .then(result => {

                // if no node was affected = (404)

                if (result.records.reduce((previous, _record) => (1 + previous), 0) === 0) { return reject(404) }

                // after a successful update, the cache should be cleared = No Content [needed in response] (204)

                nodeCache.clear()

                return resolve(204)

            })
            .catch(error => { console.error('neo4j:deleteNodeWithLabelAndId', label, id, error); return reject(500) })
            .finally(() => session.close())

        })
    }

    upsertNodeWithLabelAndId(label, id, node, isUpdate) {
        return new Promise((resolve, reject) => {

            // if inserting merge with new node
            // if updating only use existing node

            let method = isUpdate ? 'MATCH' : 'MERGE'

            let session = driver.session()

            session
            .run(`${method} (n:${label} { id: $id }) SET n = $attributes RETURN n`, { id: id, attributes: { id: id, ...node } })
            .then(result => {

                if (result.records && result.records.length === 1) {

                    // if there is exactly one affected node, return its new version

                    let record = result.records[0]

                    this.getNodeWithLabelAndId(label, id)
                    .then(cache => {

                        // if node is cached
                        // update node with correct relations and write back to cache
                        let node = { label: record.get('n').labels[0], ...record.get('n').properties, relations: cache.relations }
                        nodeCache.set(id, node)

                        return resolve(node)

                    })
                    .catch(() => {

                        // if node is not cached write it to the cache
                        let node = { label: record.get('n').labels[0], ...record.get('n').properties, relations: [] }
                        nodeCache.set(id, node)

                        return resolve(node)
                    
                    })

                } else if (result.records && result.records.length === 0) {

                    // if record size is 0 the updating id was not found
                    console.error('neo4j:upsertNodeWithLabelAndId', label, id, 404); return reject(404)

                } else {

                    // otherwise, something broke internally
                    console.error('neo4j:upsertNodeWithLabelAndId', label, id, 500); return reject(500)

                }

            })
            .catch(error => { console.error('neo4j:upsertNodeWithLabelAndId', label, id, error); return reject(500) })
            .finally(() => session.close())

        })
    }

}

module.exports = DatabaseProvider