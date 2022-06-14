class FieldValidator {

    constructor() { }

    getFields(label) {

        switch(label) {

            case 'Document': return null

            case 'Event': return [
                { name: 'type',      type: "string",  nullable: false },
                { name: 'day',       type: "number",  nullable: true  },
                { name: 'month',     type: "number",  nullable: true  },
                { name: 'year',      type: "number",  nullable: true  },
            ]

            case 'Location': return [
                { name: 'location',  type: "string",  nullable: false },
                { name: 'latitude',  type: "number",  nullable: true  },
                { name: 'longitude', type: "number",  nullable: true  },
            ]

            case 'LocationType': return [
                { name: 'default',   type: "boolean", nullable: false },
                { name: 'hierarchy', type: "number",  nullable: false },
                { name: 'type',      type: "string",  nullable: false },
            ]

            case 'Person': return [
                { name: 'firstname', type: "string",  nullable: true  },
                { name: 'lastname',  type: "string",  nullable: true  },
                { name: 'gender',    type: "string",  nullable: false },
                { name: 'alive',     type: "boolean", nullable: false },
            ]

            case 'Source': return null

            case 'Tag': return [
                { name: 'color',     type: "string",  nullable: false },
                { name: 'tag',       type: "string",  nullable: false },
            ]

            default: return null

        }

    }

    validateFields(label, data) {

        let fields = this.getFields(label)

        // incorrect label = (400)
        if (fields === null) { return { error: 400 } }

        // check for errors
        let error = null
        let validated = { }

        fields.forEach(field => {

            if (error !== null) { return }

            // missing field or wrong data type
            if (!(typeof(data[field.name]) === field.type || (data[field.name] === null && field.nullable))) { return error = { error: 400 }}

            return validated[field.name] = data[field.name]

        })

        return error === null ? validated : error

    }

}

module.exports = FieldValidator