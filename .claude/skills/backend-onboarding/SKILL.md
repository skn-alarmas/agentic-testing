---
name: backend-onboarding
description: Deja a cualquier persona del equipo lista para correr y escribir tests de API en minutos — verifica Node y dependencias, instala el kit, configura credenciales y contrato, valida con el smoke, y explica el flujo de trabajo con un ejemplo real del proyecto. Usalo cuando alguien se suma al proyecto, cuando el entorno de testing de backend no funciona, o para instalar el kit en un repo nuevo.
---

# Backend Onboarding — andando en minutos

Tu objetivo: que la persona corra `npm run test:api:smoke` **en verde** y
entienda el ciclo. No que lea 40 páginas.

Sos hospitalario y concreto. Si algo falla, lo arreglás con ella, explicando qué
pasó — no le pasás un link.

---

## El camino, en seis pasos

### 1 · Diagnóstico (30 s)

```bash
node -v                                   # ≥ 20
cat .claude/backend-testing-kit.version   # ¿ya está instalado? ¿qué versión?
ls tests/api/ 2>/dev/null                 # ¿hay suite?
cat .api-secrets.local >/dev/null 2>&1 && echo "secrets: sí" || echo "secrets: NO"
git check-ignore .api-secrets.local && echo "ignorado ✅" || echo "⚠️ NO ignorado"
```

Con eso ya sabés si es una instalación nueva, una actualización, o un entorno
roto. Decilo antes de tocar nada.

### 2 · Instalar o actualizar

```bash
bash ~/dev/agentic-testing/setup-backend-testing.sh .
```

Es idempotente y nunca pisa nada sin avisar. Si querés ver qué haría:
`--dry-run`.

### 3 · Credenciales

```bash
cp .api-secrets.local.example .api-secrets.local
git check-ignore .api-secrets.local     # tiene que decir el nombre del archivo
```

Lo que hay que completar, y por qué cada uno:

| Variable | Para qué | ¿Se puede saltear? |
|---|---|---|
| `API_BASE_URL` | Dónde está el servicio | No |
| `API_USER_ADMIN` / `PASS` | Rol amplio: lectura de la fuente de verdad | No |
| `API_USER_OPERADOR` / `PASS` | El rol que hace el trabajo | No |
| `API_USER_LECTOR` / `PASS` | Probar que **no** puede escribir | Se puede al principio |
| `API_USER_OTROUSUARIO` / `PASS` | **Probar IDOR** | No, si van a probar seguridad |
| `API_USER_OTROTENANT` / `PASS` | Aislamiento entre empresas | Sólo si la app es multi-empresa |
| `API_JWT_SECRET` | Probar expiración y forja de claims | Sí — esos tests se saltean con motivo |

> Lo que más se subestima: **`otroUsuario`**. Sin una segunda identidad no se
> puede probar IDOR, y IDOR es el bug más común de las APIs. Si no existe ese
> usuario en el ambiente de pruebas, crearlo es parte del onboarding.

Y las tres reglas: sólo ambientes de prueba · nunca credenciales personales ·
si no sabés cuáles van, preguntá (no las inventes).

### 4 · Contrato

```bash
ls openapi.yaml openapi.json docs/openapi* 2>/dev/null
```

- **Hay contrato** → `API_CONTRATO=<ruta>` y listo.
- **No hay** → `API_CONTRATO=ninguno` **por ahora**, y decilo claro: la
  dimensión D1 queda sin cubrir. El primer entregable del equipo debería ser
  generar el borrador con `/api-contract-validator`.

No pongas `ninguno` sin explicar la consecuencia: es una deuda, no una opción.

### 5 · Validar

```bash
npm run dev &                # o como se levante el servicio del proyecto
npm run test:api:smoke
```

Verde → listo. Rojo → **arreglalo ahora**, con la persona al lado:

| Error | Causa | Solución |
|---|---|---|
| `El servicio no responde en ...` | No está levantado, o es otro puerto | Levantarlo · corregir `API_BASE_URL` |
| `respondió 404` en la ruta de salud | El health check está en otra ruta | `API_RUTA_SALUD=/health` |
| `Ningún API_USER_* configurado` | Falta completar `.api-secrets.local` | Volver al paso 3 |
| `Login fallido (401)` | Credencial mala o usuario inexistente | Verificar contra el ambiente |
| `El login respondió 200 pero no encontré el token` | La API devuelve el token con otro nombre | Ajustar `hacerLogin()` en `_helpers/auth.ts` |
| `No encontré el contrato en ...` | Ruta mal apuntada | Corregir `API_CONTRATO` |
| `🛑 GUARDARRAÍL: parece PRODUCCIÓN` | **`API_BASE_URL` apunta a producción** | 🛑 Parar. Corregir la URL. No usar el override |
| `guardarraíl anti-producción` falla | Alguien tocó `clasificarUrl` | Revisar `_helpers/entorno.ts` |

### 6 · El primer ciclo real

En Claude Code, sobre un endpoint chico y de sólo lectura del proyecto:

```
/backend-rigorous-tester probá GET /api/<algo-que-exista>
```

Mirá con la persona lo que hace: mapea el endpoint, planifica las nueve
dimensiones, escribe, corre, y reporta. **Ese es todo el sistema.**

---

## Lo que hay que explicar (y sólo esto)

Cinco minutos, no más. El resto se aprende usándolo.

**1 · El ciclo.**
Mapear → planificar las 9 dimensiones → generar → correr → diagnosticar →
criticar cobertura → entregar. Nunca se saltea el primer paso.

**2 · Las nueve dimensiones.**
Contrato · happy path · autenticación · autorización · validación · bordes ·
errores · integridad · concurrencia. Un endpoint no está cubierto hasta que las
nueve tienen veredicto, incluido "no aplica porque X".

**3 · Las tres capas.**
`200 OK` no es evidencia. Respuesta → contrato → fuente de verdad. La tercera
es la que atrapa el `201` que no guardó nada.

**4 · El control positivo.**
Todo test de rechazo demuestra primero que la operación *era* posible para quien
corresponde. Sin eso, un test de seguridad contra una ruta mal escrita pasa en
verde probando nada.

**5 · Nunca hacer pasar un test debilitándolo.**
Si el servicio se rompió, el test se queda rojo y se reporta el bug. Ese rojo es
para lo que el test existe.

Y la frase que hay que dejar dicha: **pedir "hacé que pase" empuja al agente
contra su propio contrato. Lo correcto es "decime por qué no pasa".**

---

## Los comandos que se usan todos los días

```bash
npm run test:api                 # suite completa
npm run test:api:smoke           # ¿el entorno está bien?     (< 30 s)
npm run test:api:critico         # lo que no puede romperse   (< 5 min)
npm run test:api:seguridad       # el catálogo OWASP
npm run test:api:contrato        # cumplimiento del contrato
npm run test:api:aleatorio       # 3 corridas en orden aleatorio ← antes de commitear
npx vitest run tests/api/facturas.test.ts --reporter=verbose
```

---

## Reglas duras

1. **No termines el onboarding con el smoke en rojo.** Un entorno a medias
   garantiza que la persona no vuelve a intentarlo.
2. **No completes credenciales por tu cuenta.** Si no las tenés, decí cuáles
   faltan y a quién pedírselas.
3. **Nunca apuntes a producción**, ni "para probar rápido".
4. **`API_CONTRATO=ninguno` siempre con la consecuencia dicha.**
5. **Si falta `otroUsuario`, decilo:** sin esa identidad, la mitad del valor del
   kit no se puede usar.

---

## Al terminar, respondé así

```
✅ Entorno listo

  Node 22.4.0 · kit de backend 1.1.0 · vitest 3.2.4
  Servicio: http://localhost:3100 (seguro)
  Contrato: openapi.yaml — 31 operaciones
  Identidades: admin ✅ · operador ✅ · lector ✅ · otroUsuario ✅ · otroTenant ❌

  npm run test:api:smoke → 7 pasaron (2.1 s)

⚠️ Pendientes
  1. Falta el usuario `otroTenant` en el ambiente de pruebas. Sin él no se puede
     probar aislamiento entre empresas (S1/S10). Pedírselo a <quien corresponda>.
  2. Sin API_JWT_SECRET: los tests de expiración y forja de claims se van a
     saltear con motivo, no en falso verde.

Siguiente paso sugerido:
  /backend-rigorous-tester probá GET /api/clientes

Leer una vez, entero: BACKEND_TESTING_STANDARDS.md
Prompts del día a día: BACKEND_PROMPTS.md
```
