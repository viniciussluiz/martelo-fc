import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { SUPPORT_PIX } from '../../shared/pix';
import { Icon } from '../components/Icon';
import { SectionTitle } from '../components/ui';
import { navigate } from '../lib/router';
import { toast } from '../lib/store';

/** QR Code do Pix desenhado em SVG (sem imagem externa). */
function PixQr({ text }: { text: string }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, n };
  }, [text]);
  const pad = 3;
  return (
    <svg className="pix-qr" viewBox={`${-pad} ${-pad} ${path.n + pad * 2} ${path.n + pad * 2}`} role="img" aria-label="QR Code do Pix para apoiar o Leilão FC" shapeRendering="crispEdges">
      <rect x={-pad} y={-pad} width={path.n + pad * 2} height={path.n + pad * 2} fill="#fff" />
      <path d={path.d} fill="#24160c" />
    </svg>
  );
}

function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ kind: 'sucesso', title: done });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ kind: 'erro', title: 'Não deu para copiar', body: 'Selecione o texto e copie manualmente.' });
    }
  };
  return (
    <button type="button" className="btn btn-primary" onClick={() => void copy()}>
      <Icon name="lacre" /> {copied ? 'Copiado!' : label}
    </button>
  );
}

/** Apoio voluntário por Pix: QR Code, copia e cola e a chave. */
export function SupportPage() {
  return (
    <article className="rules info-page">
      <header className="rules-head">
        <h1>Apoie o Leilão FC</h1>
        <p>O jogo é gratuito e feito por uma pessoa só. Se ele rende boas resenhas com os seus amigos, um Pix de qualquer valor ajuda a pagar o servidor e a continuar melhorando.</p>
      </header>
      <section className="rules-block">
        <SectionTitle>Pix</SectionTitle>
        <div className="pix-box">
          <PixQr text={SUPPORT_PIX.payload} />
          <div className="pix-side">
            <p>
              Abra o aplicativo do seu banco, escolha <strong>Pix → Ler QR Code</strong> e aponte para o código. O valor é você quem escolhe.
            </p>
            <p>No celular, é mais fácil copiar o código e colar em <strong>Pix copia e cola</strong>:</p>
            <CopyButton text={SUPPORT_PIX.payload} label="Copiar código Pix" done="Código Pix copiado" />
            <CopyButton text={SUPPORT_PIX.key} label="Copiar a chave" done="Chave Pix copiada" />
            <dl className="pix-key">
              <dt>Chave ({SUPPORT_PIX.keyKind})</dt>
              <dd className="pix-key-value">{SUPPORT_PIX.keyLabel}</dd>
              <dt>Nome que aparece no banco</dt>
              <dd>{SUPPORT_PIX.holder}</dd>
            </dl>
            <p className="small muted">Confira o nome antes de confirmar. O apoio é voluntário e não libera nada dentro do jogo: todo mundo joga igual.</p>
          </div>
        </div>
      </section>
      <section className="rules-block">
        <SectionTitle>Outras formas de ajudar</SectionTitle>
        <ul className="info-list">
          <li>Chame os amigos para uma sala: o jogo fica melhor com mais gente.</li>
          <li>
            Achou jogador faltando, nota estranha ou erro? Conte pela página de{' '}
            <a
              href="/contato"
              onClick={(e) => {
                e.preventDefault();
                navigate('/contato');
              }}
            >
              Contato
            </a>
            .
          </li>
        </ul>
      </section>
    </article>
  );
}
