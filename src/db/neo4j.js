// configure database connection

const neo4j   = require('neo4j-driver')
const driver  = neo4j.driver(process.env.NEO4J_HOST, neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD))

// configure relationships

let relationshipFields = new Set(['attended', 'containedin', 'documentedby', 'events', 'haschildren', 'hasparents', 'locationtype', 'partof', 'persons', 'sourcedby', 'storedin', 'tags', 'wasin'])



/* GET REQUESTS */



// read nodes with their relations

function getNodes(label, id = null) {
    return new Promise((resolve, reject) => {

        let query = `MATCH (n1:${label}${ id === null ? '' : ' { id : $id}' }) OPTIONAL MATCH (n1)-[r]-(n2) RETURN n1, r, head(labels(n2)) as n2label, head(collect(n2.id)) as n2id`
        let param = { id: id }

        let session = driver.session()

        return session
        .readTransaction(tx => tx.run(query, param))
        .then(result => {

            let nodes = extractNodes(result.records)

            // return full result set
            if (id === null) { return resolve(nodes) }

            // no result for single id = (404)
            if (nodes.length !== 1) { return reject(404) }

            // return single id as object, not array
            return resolve(nodes[0])

        })
        .catch((error) => {
            console.error(error)
            return reject(500)
        })
        .finally(() => session.close())

    })
}

// extract nodes from records

function extractNodes(records) {

    let nodes = []

    records.forEach(record => {

        // check if already in nodes and push as new node
        let index = nodes.findIndex(e => e.id === record.get('n1').properties.id)

        if (index < 0) {
            nodes.push({ ...record.get('n1').properties, relations: [] })
            index = nodes.length - 1
        }

        // extract relations and add to node
        let relationship = extractRelationship(record)
        return relationship ? nodes[index].relations.push(relationship) : null

    })

    return nodes

}

// extract a single relationship from a given record

function extractRelationship(record) {

    let i  = record.get('n1').identity.low
    let nl = record.get('n2label')
    let ni = record.get('n2id')
    let r  = record.get('r')

    if (!((i >= 0) && nl && ni && r)) { return null }

    return { label: nl, id: ni, direction: r.start.low === i ? 'to' : 'from' }

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



/* UPSERT REQUESTS */



// upsert a node

function upsertNode(label, id, node, isUpdate) {
    return new Promise((resolve, reject) => {

        // attributes are node fields minus relationship fields
        // relations  are relationship fields minus node fields
        // additional parameters for the query - based on relations

        let attributes = { }
        let relations  = { }
        let addParams  = { }

        for (let [key, value] of Object.entries(node)) {

            if (relationshipFields.has(key)) { relations[key] = value }
            else { attributes[key] = value }

        }

        // if inserting merge with new node
        // if updating match with existing node

        let query = `${isUpdate ? 'MATCH' : 'MERGE'} (n1:${label} { id: $id }) SET n1 = $attributes`

        // relationship for different nodes

        switch(label) {

            case 'Document':

                addParams.events = relations.events
                addParams.persons = relations.persons
                addParams.sourcedby = relations.sourcedby || 's'
                addParams.tags = relations.tags

                query += ` WITH n1 OPTIONAL MATCH (n1)<-[r:DOCUMENTEDBY]-(e:Event) WHERE NOT e.id IN $events DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)<-[r:DOCUMENTEDBY]-(p:Person) WHERE NOT p.id IN $persons DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:SOURCEDBY]->(s:Source) WHERE NOT s.id = $sourcedby DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:TAGGED]->(t:Tag) WHERE NOT t.id IN $tags DELETE r`

                if (addParams.events.length) { query += ` WITH n1 MATCH (e:Event) WHERE e.id IN $events MERGE (n1)<-[r:DOCUMENTEDBY]-(e)` }
                if (addParams.persons.length) { query += ` WITH n1 MATCH (p:Person) WHERE p.id IN $persons MERGE (n1)<-[r:DOCUMENTEDBY]-(p)` }
                if (addParams.sourcedby !== 's') { query += ` WITH n1 MATCH (s:Source { id: $sourcedby }) MERGE (n1)-[r:SOURCEDBY]->(s)` }
                if (addParams.tags.length) { query += ` WITH n1 MATCH (t:Tag) WHERE t.id IN $tags MERGE (n1)-[r:TAGGED]->(t)` }

                break

            case 'Event':

                addParams.attended = relations.attended
                addParams.documentedby = relations.documentedby
                addParams.tags = relations.tags
                addParams.wasin = relations.wasin || 'w'

                query += ` WITH n1 OPTIONAL MATCH (n1)<-[r:ATTENDED]-(p:Person) WHERE NOT p.id IN $attended DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:DOCUMENTEDBY]->(d:Document) WHERE NOT d.id IN $documentedby DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:TAGGED]->(t:Tag) WHERE NOT t.id IN $tags DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:WASIN]->(l:Location) WHERE NOT l.id = $wasin DELETE r`

                if (addParams.attended.length) { query += ` WITH n1 MATCH (p:Person) WHERE p.id IN $attended MERGE (n1)<-[r:ATTENDED]-(p)` }
                if (addParams.documentedby.length) { query += ` WITH n1 MATCH (d:Document) WHERE d.id IN $documentedby MERGE (n1)-[r:DOCUMENTEDBY]->(d)` }
                if (addParams.tags.length) { query += ` WITH n1 MATCH (t:Tag) WHERE t.id IN $tags MERGE (n1)-[r:TAGGED]->(t)` }
                if (addParams.wasin !== 'w') { query += ` WITH n1 MATCH (l:Location { id: $wasin }) MERGE (n1)-[r:WASIN]->(l)` }

                break

            case 'Location':

                addParams.documentedby = relations.documentedby
                addParams.locationtype = relations.locationtype || 'l'
                addParams.partof = relations.partof || 'p'
                addParams.tags = relations.tags

                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:DOCUMENTEDBY]->(d:Document) WHERE NOT d.id IN $documentedby DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:LOCATIONTYPE]->(l:LocationType) WHERE NOT l.id = $locationtype DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:PARTOF]->(l:Location) WHERE NOT l.id = $partof DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:TAGGED]->(t:Tag) WHERE NOT t.id IN $tags DELETE r`

                if (addParams.documentedby.length) { query += ` WITH n1 MATCH (d:Document) WHERE d.id IN $documentedby MERGE (n1)-[r:DOCUMENTEDBY]->(d)` }
                if (addParams.locationtype !== 'l') { query += ` WITH n1 MATCH (l:LocationType { id: $locationtype }) MERGE (n1)-[r:LOCATIONTYPE]->(l)` }
                if (addParams.partof !== 'p') { query += ` WITH n1 MATCH (l:Location { id: $partof }) MERGE (n1)-[r:PARTOF]->(l)` }
                if (addParams.tags.length) { query += ` WITH n1 MATCH (t:Tag) WHERE t.id IN $tags MERGE (n1)-[r:TAGGED]->(t)` }

                break

            case 'Person':

                addParams.documentedby = relations.documentedby
                addParams.haschildren = relations.haschildren
                addParams.hasparents = relations.hasparents
                addParams.tags = relations.tags

                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:DOCUMENTEDBY]->(d:Document) WHERE NOT d.id IN $documentedby DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)<-[r:HASPARENT]-(p:Person) WHERE NOT p.id IN $haschildren DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:HASPARENT]->(p:Person) WHERE NOT p.id IN $hasparents DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:TAGGED]->(t:Tag) WHERE NOT t.id IN $tags DELETE r`

                if (addParams.documentedby.length) { query += ` WITH n1 MATCH (d:Document) WHERE d.id IN $documentedby MERGE (n1)-[r:DOCUMENTEDBY]->(d)` }
                if (addParams.haschildren.length) { query += ` WITH n1 MATCH (p:Person) WHERE p.id IN $haschildren MERGE (n1)<-[r:HASPARENT]-(p)` }
                if (addParams.hasparents.length) { query += ` WITH n1 MATCH (p:Person) WHERE p.id IN $hasparents MERGE (n1)-[r:HASPARENT]->(p)` }
                if (addParams.tags.length) { query += ` WITH n1 MATCH (t:Tag) WHERE t.id IN $tags MERGE (n1)-[r:TAGGED]->(t)` }

                break

            case 'Source':

                addParams.containedin = relations.containedin || 'c'
                addParams.storedin = relations.storedin || 's'
                addParams.tags = relations.tags

                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:CONTAINEDIN]->(s:Source) WHERE NOT s.id = $containedin DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:STOREDIN]->(l:Location) WHERE NOT l.id = $storedin DELETE r`
                query += ` WITH n1 OPTIONAL MATCH (n1)-[r:TAGGED]->(t:Tag) WHERE NOT t.id IN $tags DELETE r`

                if (addParams.containedin !== 'c') { query += ` WITH n1 MATCH (s:Source { id: $containedin }) MERGE (n1)-[r:CONTAINEDIN]->(s)` }
                if (addParams.storedin !== 's') { query += ` WITH n1 MATCH (l:Location { id: $storedin }) MERGE (n1)-[r:STOREDIN]->(l)` }
                if (addParams.tags.length) { query += ` WITH n1 MATCH (t:Tag) WHERE t.id IN $tags MERGE (n1)-[r:TAGGED]->(t)` }

                break

            default: break

        }

        // continue with query and get default results

        query += ' WITH n1 OPTIONAL MATCH (n1)-[r]-(n2) RETURN n1, r, head(labels(n2)) as n2label, head(collect(n2.id)) as n2id'

        let session = driver.session()

        return session
        .run(query, { id: id, attributes: { id: id, ...attributes }, ...addParams })
        .then(result => {

            // id was not found = (404)
            if (!result.records.length) { return reject(404) }

            // extract node properties
            let returnNode = { ...result.records[0].get('n1').properties, relations: [] }

            // extract internal identity
            let identity = result.records[0].get('n1').identity.low

            // extract relationships and add to node
            result.records.forEach(record => {

                let relationship = extractRelationship(record, identity)
                if (!relationship) { return }
                return returnNode.relations.push(relationship)

            })

            return resolve(returnNode)

        })
        .catch(() => reject(500))
        .finally(() => session.close())

    })
}



/* MODULE EXPORTS */

module.exports = {
    deleteNodeWithLabelAndId,
    getNodes,
    upsertNode,
}