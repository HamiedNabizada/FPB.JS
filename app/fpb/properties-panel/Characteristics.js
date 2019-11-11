import React from "react";

export default function Characteristics(test) {
    console.log(test)
    return (
        <div className="characteristics-properties" key={test.category.uniqueIdent}>
            <span>{test.category.uniqueIdent}</span>
        </div>
    )
}

/*
const Characteristics = ({ char, no }) => (
    <fieldset>
        <legend><h4>{char.category.shortName}</h4></legend>
        <fieldset>
            <label>key</label>
            <span>{n}</span>
        </fieldset>
        <fieldset>
            <legend>Category</legend>
            <label>unique ident</label>
            <span>{char.category.uniqueIdent}</span><br></br><br></br>
        </fieldset>

        <fieldset>
            <legend>Descriptive Element</legend>
            <label>Value Determination Process</label>
            <input value={char.descriptiveElement.valueDeterminationProcess || ''} onChange={(event) => {
              updateIdentifactionProperty('shortName', event.target.value)
            }} /><br></br><br></br>
        </fieldset>

    </fieldset>
);

export default Characteristics;

*/