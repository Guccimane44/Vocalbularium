import type { CoreValue } from '../../define.js';

// Whether the selection is Chinese: the core names its language 中文, 汉语 or
// 普通话. Pinyin and Grammar teacher describe the selection, so they apply only then (D374).
const CHINESE_NAMES: readonly string[] = ['中文', '汉语', '普通话'];
export const isChineseSelection = (core: CoreValue): boolean => CHINESE_NAMES.includes(String(core.language ?? '').trim());
