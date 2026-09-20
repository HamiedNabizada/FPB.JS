// tests/unit/xml/XMLMapperRoundtripCache.test.js
import { describe, it, expect, vi } from 'vitest';

import XMLMapper from '../../../app/fpb/xml/XMLMapper.js';

/**
 * Der XMLMapper hebt beim Export die Daten auf, damit ein Import derselben
 * Datei zurückbringt, was das XML nicht trägt. Wer den Mapper aber für die
 * ganze Sitzung behält (die API-Fassade tut das), bekam nach einem Export für
 * JEDE weitere XML-Datei das eben exportierte Modell zurück, ohne Hinweis.
 *
 * Geprüft wird hier nur diese Entscheidung, nicht das Parsen: der
 * Namensraum `visual:` kommt in happy-dom ohnehin nicht durch.
 */
describe('XMLMapper: Zwischenspeicher der Rundreise', () => {

  function mapperMitExport() {
    const mapper = new XMLMapper();
    mapper.originalJsonData = [{ process: { id: 'p1' }, elementDataInformation: [], elementVisualInformation: [] }];
    mapper.originalXmlString = '<?xml version="1.0"?>\n<project id="eigen"/>';
    // das Parsen der fremden Datei wird nicht mitgetestet
    mapper._convertXMLtoJSON = vi.fn(() => 'GEPARST');
    mapper._extractAllVisualInformation = vi.fn(() => []);
    mapper._updateVisualInformation = vi.fn((data) => data);
    mapper._cleanupTemporaryFields = vi.fn();
    return mapper;
  }

  it('gibt für die eigene Datei die aufgehobenen Daten zurück', async () => {
    const mapper = mapperMitExport();

    const ergebnis = await mapper.convertFromXML(mapper.originalXmlString);

    expect(ergebnis).toBe(mapper.originalJsonData);
    expect(mapper._convertXMLtoJSON).not.toHaveBeenCalled();
  });

  it('stört sich nicht an Leerraum am Rand der Datei', async () => {
    const mapper = mapperMitExport();

    const ergebnis = await mapper.convertFromXML('\n' + mapper.originalXmlString + '\n');

    expect(ergebnis).toBe(mapper.originalJsonData);
  });

  /** Der eigentliche Fehler: eine fremde Datei wurde vom Zwischenspeicher verschluckt */
  it('parst eine andere Datei, statt das eigene Modell zurückzugeben', async () => {
    const mapper = mapperMitExport();

    const ergebnis = await mapper.convertFromXML('<?xml version="1.0"?>\n<project id="fremd"/>');

    expect(ergebnis).toBe('GEPARST');
    expect(mapper._convertXMLtoJSON).toHaveBeenCalledTimes(1);
  });

  it('parst, solange nichts exportiert wurde', async () => {
    const mapper = new XMLMapper();
    mapper._convertXMLtoJSON = vi.fn(() => 'GEPARST');

    expect(await mapper.convertFromXML('<project id="fremd"/>')).toBe('GEPARST');
  });
});
