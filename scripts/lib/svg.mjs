// Piezas compartidas para los SVG del perfil: tipografía, paleta y escape XML.

export const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";

/** Paleta neutra, alineada con la interfaz de GitHub en tema claro y oscuro. */
export const THEMES = {
  dark: {
    card: '#0D1117',
    border: '#30363D',
    text: '#E6EDF3',
    muted: '#9198A1',
    track: '#21262D',
    accent: '#4493F8',
  },
  light: {
    card: '#FFFFFF',
    border: '#D1D9E0',
    text: '#1F2328',
    muted: '#59636E',
    track: '#EFF2F5',
    accent: '#0969DA',
  },
};

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** Escapa texto para meterlo en nodos o atributos XML. */
export function escapeXml(value) {
  // Los caracteres de control no son válidos en XML 1.0: se quitan antes de escapar.
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}
