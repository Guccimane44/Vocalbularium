import type { ModuleFamily } from '@vocabularium/domain/page-modules';

// One small glyph per module family (D05). Decorative: the family colour and
// glyph always appear beside the module's or family's name.
const GLYPHS: Record<ModuleFamily, string[]> = {
  meaning: ['M4 4.5h5.5a2.5 2.5 0 0 1 2.5 2.5v9a2 2 0 0 0-2-2H4z', 'M20 4.5h-5.5A2.5 2.5 0 0 0 12 7v9a2 2 0 0 1 2-2h6z'],
  usage: ['M5 7h5v5H7.5L6 15H5z', 'M14 7h5v5h-2.5L15 15h-1z'],
  roots: ['M12 3v9', 'M12 12l-5 7', 'M12 12l5 7', 'M12 12v8'],
  connections: ['M9 12a3 3 0 1 1-3-3', 'M15 12a3 3 0 1 1 3 3', 'M8 12h8'],
  sound: ['M5 10v4h3l4 4V6L8 10z', 'M16 9a4 4 0 0 1 0 6', 'M18.5 6.5a7.5 7.5 0 0 1 0 11'],
  notes: ['M15 4.5l4.5 4.5L9 19.5H4.5V15z', 'M13 6.5l4.5 4.5']
};

export function FamilyIcon({ family }: { family: ModuleFamily }) {
  return <svg className="fam-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {GLYPHS[family].map((path, index) => <path d={path} key={index} />)}
  </svg>;
}
