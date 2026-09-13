export const PLAIN_MENU_WIDTH = 144;
export const PLAIN_MENU_MAX_HEIGHT = 256;
export const PLAIN_MENU_GAP = 4;
export const PLAIN_MENU_PAD = 8;
/** 下部タブバー＋余白。メニューがタブの下に隠れて選べなくなるのを防ぐ */
export const PLAIN_MENU_BOTTOM_BAR = 72;

export function estimatePlainMenuHeight(optionCount: number): number {
  const item = 36;
  const chrome = 8;
  return Math.min(
    PLAIN_MENU_MAX_HEIGHT,
    chrome + Math.max(1, optionCount) * item,
  );
}

export function placePlainMenu(input: {
  buttonTop: number;
  buttonBottom: number;
  buttonLeft: number;
  viewportWidth: number;
  viewportHeight: number;
  menuHeight: number;
  bottomBar?: number;
}): { top: number; left: number; maxHeight: number } {
  const bottomBar = input.bottomBar ?? PLAIN_MENU_BOTTOM_BAR;
  const pad = PLAIN_MENU_PAD;
  const gap = PLAIN_MENU_GAP;
  const left = Math.min(
    Math.max(pad, input.buttonLeft),
    Math.max(pad, input.viewportWidth - PLAIN_MENU_WIDTH - pad),
  );
  const spaceBelow =
    input.viewportHeight - bottomBar - pad - input.buttonBottom;
  const spaceAbove = input.buttonTop - pad;
  const desired = Math.min(
    PLAIN_MENU_MAX_HEIGHT,
    Math.max(48, input.menuHeight),
  );
  const openUp = spaceBelow < desired && spaceAbove > spaceBelow;
  const available = Math.max(48, (openUp ? spaceAbove : spaceBelow) - gap);
  const maxHeight = Math.min(desired, available);
  const top = openUp
    ? Math.max(pad, input.buttonTop - gap - maxHeight)
    : input.buttonBottom + gap;
  return { top, left, maxHeight };
}
