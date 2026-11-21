import { useCallback, useRef } from 'react';

/**
 * Fileira que rola de lado quando não cabe (abas, menu do topo).
 *
 * No celular o dedo já arrasta. No computador, com mouse, não havia como: a barra de rolagem fica
 * escondida para não separar as abas do painel. Aqui a fileira passa a aceitar:
 *  - arrastar com o botão do mouse apertado (um clique sem arrastar continua sendo clique);
 *  - a rodinha do mouse, que rola para o lado enquanto houver para onde ir (na ponta, a página rola);
 *  - levar a aba escolhida para dentro da área visível.
 * `data-more` (start | end | both) marca de que lado há coisa escondida; o CSS esmaece aquela borda.
 */
export function attachHScroll(el: HTMLElement): () => void {
  /** A pessoa já mexeu na fileira: a abertura não puxa mais a aba escolhida para a vista. */
  let settled = false;
  const update = () => {
    const max = el.scrollWidth - el.clientWidth;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft < max - 1;
    const more = max <= 1 ? null : start && end ? 'both' : start ? 'start' : end ? 'end' : null;
    if (more) el.dataset.more = more;
    else delete el.dataset.more;
  };

  /** Traz um item para dentro da fileira sem mexer na rolagem da página. */
  const reveal = (item: Element | null, smooth: boolean) => {
    if (!item || el.scrollWidth <= el.clientWidth) return;
    const box = el.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    const pad = 24;
    let delta = 0;
    if (r.right > box.right - pad) delta = r.right - box.right + pad;
    else if (r.left < box.left + pad) delta = r.left - box.left - pad;
    if (delta) el.scrollTo({ left: el.scrollLeft + delta, behavior: smooth ? 'smooth' : 'auto' });
  };
  const selected = () => el.querySelector('[aria-selected="true"], [aria-current="page"]');

  let drag: { id: number; x: number; left: number; moved: boolean } | null = null;
  let swallowClick = false;
  const onDown = (e: PointerEvent) => {
    settled = true;
    if (e.pointerType !== 'mouse' || e.button !== 0 || el.scrollWidth <= el.clientWidth) return;
    drag = { id: e.pointerId, x: e.clientX, left: el.scrollLeft, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      drag.moved = true;
      el.dataset.dragging = '';
      el.setPointerCapture?.(e.pointerId);
    }
    el.scrollLeft = drag.left - dx;
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    swallowClick = drag.moved;
    drag = null;
    delete el.dataset.dragging;
    // O clique que vem logo depois do arrasto não conta; se não vier, a trava sai sozinha.
    if (swallowClick) setTimeout(() => (swallowClick = false), 50);
  };
  const onClick = (e: MouseEvent) => {
    if (swallowClick) {
      e.preventDefault();
      e.stopPropagation();
      swallowClick = false;
      return;
    }
    reveal((e.target as Element).closest('button, a'), true);
  };
  const onWheel = (e: WheelEvent) => {
    settled = true;
    if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) return;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const next = Math.max(0, Math.min(max, el.scrollLeft + dy));
    if (Math.abs(next - el.scrollLeft) < 1) return;
    el.scrollLeft = next;
    e.preventDefault();
  };
  const onDragStart = (e: DragEvent) => e.preventDefault();

  const onTouch = () => {
    settled = true;
  };
  el.addEventListener('scroll', update, { passive: true });
  el.addEventListener('touchstart', onTouch, { passive: true });
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('click', onClick, true);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('dragstart', onDragStart);
  // Na primeira medida (e quando as fontes terminam de carregar) a aba escolhida já aparece.
  const resize = new ResizeObserver(() => {
    update();
    if (!settled) reveal(selected(), false);
  });
  resize.observe(el);
  void document.fonts?.ready.then(() => {
    update();
    if (!settled) reveal(selected(), false);
  });
  // A troca de seleção (teclado, outra página) traz a escolhida para a vista. Itens que entram ou
  // saem (o menu ganha Perfil e Troféus quando a conta carrega) também, até a pessoa mexer na
  // fileira; depois disso, contadores que mudam durante o jogo não a puxam de volta.
  const mutations = new MutationObserver((records) => {
    update();
    if (!settled || records.some((r) => r.type === 'attributes')) reveal(selected(), settled);
  });
  mutations.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'aria-current'] });
  update();
  reveal(selected(), false);

  return () => {
    el.removeEventListener('scroll', update);
    el.removeEventListener('touchstart', onTouch);
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('click', onClick, true);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('dragstart', onDragStart);
    resize.disconnect();
    mutations.disconnect();
    delete el.dataset.more;
    delete el.dataset.dragging;
  };
}

/** Ref para pôr numa fileira que rola de lado (veja `attachHScroll`). */
export function useHScroll<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = el ? attachHScroll(el) : null;
  }, []);
}
