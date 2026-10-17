# Formato do baralho

O servidor lê o baralho de `DECK_PATH` (padrão `data/deck.json`) e valida no boot.

```json
{
  "id": "lendas-ficticias-v1",
  "name": "Lendas Fictícias",
  "version": 1,
  "cards": [
    {
      "id": "c001",
      "name": "Zeca Trovão",
      "position": "ATA",
      "club": "Atlético Serrano",
      "year": 1987,
      "levelMin": 84,
      "levelMax": 91,
      "tier": "craque",
      "hint": "Artilheiro do estadual de 1987 com folga."
    }
  ]
}
```

- `position`: `GOL` | `LAT` | `ZAG` | `MEI` | `ATA`.
- `tier`: `lenda` | `craque` | `titular` | `operario` | `perna` (exibido no martelo; a faixa exata só na Cerimônia).
- `levelMin` ≤ `levelMax`, entre 1 e 99. `id` único e estável (é usado no histórico e no reaproveitamento entre ciclos).
- Quantidade recomendada para salas de 20 técnicos: ≥ 21 GOL, ≥ 41 LAT, ≥ 41 ZAG, ≥ 81 MEI e ≥ 61 ATA. Se faltar carta, o Monte completa com reservas genéricas.

O baralho padrão é fictício e gerado por `npm run deck:generate` (determinístico). Para usar jogadores reais, use um conjunto de dados
licenciado no mesmo formato.
