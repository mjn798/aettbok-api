const fieldValidation = new Map()

fieldValidation.set('Document', [
    /* fields */
    { name: 'content',      type: "string",  nullable: true  },
    { name: 'index',        type: "string",  nullable: true  },
    { name: 'day',          type: "number",  nullable: true  },
    { name: 'month',        type: "number",  nullable: true  },
    { name: 'year',         type: "number",  nullable: true  },
    /* relations */
    { name: 'persons',      type: "object",  nullable: false }, // 1:n
    { name: 'sourcedby',    type: "string",  nullable: true  },
    { name: 'tags',         type: "object",  nullable: false }, // 1:n
])

fieldValidation.set('Event', [
    /* fields */
    { name: 'comment',      type: "string",  nullable: true  },
    { name: 'type',         type: "string",  nullable: false },
    { name: 'day',          type: "number",  nullable: true  },
    { name: 'month',        type: "number",  nullable: true  },
    { name: 'year',         type: "number",  nullable: true  },
    /* relations */
    { name: 'attended',     type: "object",  nullable: true  }, // 1:n
    { name: 'documentedby', type: "object",  nullable: true  }, // 1:n
    { name: 'tags',         type: "object",  nullable: false }, // 1:n
    { name: 'wasin',        type: "string",  nullable: true  },
])

fieldValidation.set('Location', [
    /* fields */
    { name: 'location',     type: "string",  nullable: false },
    { name: 'latitude',     type: "number",  nullable: true  },
    { name: 'longitude',    type: "number",  nullable: true  },
    /* relations */
    { name: 'documentedby', type: "object",  nullable: true  }, // 1:n
    { name: 'locationtype', type: "string",  nullable: true  },
    { name: 'partof',       type: "string",  nullable: true  },
    { name: 'tags',         type: "object",  nullable: false }, // 1:n
])

fieldValidation.set('LocationType', [
    /* fields */
    { name: 'hierarchy',    type: "number",  nullable: false },
    { name: 'type',         type: "string",  nullable: false },
    /* no relations */
])

fieldValidation.set('Person', [
    /* fields */
    { name: 'firstname',    type: "string",  nullable: true  },
    { name: 'lastname',     type: "string",  nullable: true  },
    { name: 'notes',        type: "string",  nullable: true  },
    { name: 'gender',       type: "string",  nullable: false },
    { name: 'alive',        type: "boolean", nullable: false },
    /* relations */
    { name: 'documentedby', type: "object",  nullable: true  }, // 1:n
    { name: 'hasparents',   type: "object",  nullable: true  }, // 1:n
    { name: 'tags',         type: "object",  nullable: false }, // 1:n
])

fieldValidation.set('Source', [
    /* fields */
    { name: 'source',       type: "string",  nullable: false },
    { name: 'author',       type: "string",  nullable: true  },
    { name: 'link',         type: "string",  nullable: true  },
    /* relations */
    { name: 'containedin',  type: "string",  nullable: true  },
    { name: 'storedin',     type: "string",  nullable: true  },
    { name: 'tags',         type: "object",  nullable: false }, // 1:n
])

fieldValidation.set('Tag', [
    /* fields */
    { name: 'color',        type: "string",  nullable: false },
    { name: 'tag',          type: "string",  nullable: false },
    /* no relations */
])

function validateFields(label, data) {

    let fields = fieldValidation.get(label)

    // unknown label = (404)
    if (!fields) { return { error: 404 } }

    // check for errors
    let error = null
    let validated = { }

    fields.forEach(field => {

        if (error) { return }

        // missing field or wrong data type
        if (!(typeof(data[field.name]) === field.type || (data[field.name] === null && field.nullable))) { return error = { error: 400 }}

        return validated[field.name] = data[field.name]

    })

    return error === null ? validated : error

}

module.exports = { validateFields }