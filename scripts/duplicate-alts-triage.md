# Triagem de DUPLICATE_ALTERNATIVES

Cada bloco abaixo mostra uma questão com 2+ alternativas idênticas (após normalização case-insensitive + whitespace). Confira contra a fonte original (PDF do INEP em `ENEMs/`) e decida:

- **Bug real do parser** → editar o JSON, restaurar a alternativa correta.
- **Legítimo** (raro) → ignorar.

## math_enem_2019.json

### Q165

**Texto:** O álcool é um depressor do sistema nervoso central e age diretamente em diversos órgãos. A concentração de álcool no sangue pode ser entendida como a razão entre a quantidade q de álcool ingerido, me…

**Gabarito declarado:** e

**Alternativas:**

| Letra | Texto |
|---|---|
| **A** | q/(0,8m) > 0,4 |
| **B** | q/(0,8m) > 0,4 |
| **C** | q/(0,08m) > 0,4 |
| **D** | q/(0,08m) > 0,4 |
| **E** | q/(0,08m) > 0,4 |

**Grupos duplicados:** (A = B) · (C = D = E)

---

## nature_enem_2019.json

### Q113

**Texto:** O espectrômetro de massa de tempo de voo é um dispositivo utilizado para medir a massa de íons. Nele, um íon de carga elétrica q é lançado em uma região de campo magnético constante B, descrevendo um…

**Gabarito declarado:** a

**Alternativas:**

| Letra | Texto |
|---|---|
| **A** | qBt / 2N |
| **B** | qBt / N |
| **C** | 2qBt / N |
| **D** | qBt / N |
| **E** | 2qBt / N |

**Grupos duplicados:** (B = D) · (C = E)

---

## Resumo

- Questões com duplicatas: **2**
- Grupos de letras duplicadas: **4**
