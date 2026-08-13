# Guía de adopción rápida — testing de backend

Cómo poner este estándar a andar en el equipo en **menos de 20 minutos**, y
cómo hacer que sobreviva al tercer sprint.

---

## Los 20 minutos

### Minutos 0–5 · Elegir el repo piloto

**No empieces por el servicio más importante.** Empezá por uno que cumpla tres cosas:

1. Tiene un ambiente de pruebas que se puede romper sin pedir permiso
2. Tiene al menos **dos usuarios** distintos (sin eso no se puede probar IDOR)
3. Alguien del equipo lo conoce bien y va a estar disponible esta semana

Si ninguno cumple las tres, el primer trabajo del equipo no es instalar el kit:
es crear el segundo usuario en el ambiente de pruebas. Toma diez minutos y
desbloquea la mitad del valor.

### Minutos 5–8 · Instalar

```bash
git clone https://github.com/skn-alarmas/agentic-testing.git ~/dev/agentic-testing
bash ~/dev/agentic-testing/setup-backend-testing.sh /ruta/al/repo-piloto
```

Idempotente y con `--dry-run` si querés ver antes qué toca. Commiteá
`.claude/backend-testing-kit.version`: es lo que le dice al equipo qué versión
del estándar tiene cada proyecto.

### Minutos 8–12 · Credenciales y contrato

```bash
cd /ruta/al/repo-piloto
cp .api-secrets.local.example .api-secrets.local
git check-ignore .api-secrets.local        # tiene que devolver el nombre del archivo
```

Lo mínimo para arrancar: `API_BASE_URL`, `API_USER_ADMIN`, `API_USER_OPERADOR`
y **`API_USER_OTROUSUARIO`**.

> El que más se subestima es el último. Sin una segunda identidad no se puede
> probar IDOR — el bug más común de las APIs — y la suite de seguridad queda
> decorativa.

Y el contrato:

- Hay OpenAPI → `API_CONTRATO=ruta/al/openapi.yaml`
- No hay → `API_CONTRATO=ninguno`, **y anotalo como deuda**: la dimensión D1
  queda sin cubrir. Generar el borrador es el primer entregable
  (`/api-contract-validator`).

### Minutos 12–15 · Validar

```bash
# levantar el servicio y su base de pruebas
npm run test:api:smoke
```

Verde → listo. Rojo → arreglalo ahora; los siete motivos habituales están en la
skill `backend-onboarding`, con su solución al lado. **No sigas con el smoke en
rojo**: un entorno a medias garantiza que nadie vuelve a intentarlo.

### Minutos 15–20 · El primer ciclo real

En Claude Code, sobre un endpoint chico:

```
/backend-rigorous-tester probá GET /api/<algo-que-exista>
```

Miralo trabajar con el equipo delante. Mapea, planifica las nueve dimensiones,
escribe, corre, rompe el servicio a propósito y reporta. **Ese es todo el
sistema**; el resto son variantes con más control.

---

## Lo que hay que explicar (5 minutos, no más)

**1. Las nueve dimensiones.** Contrato · happy path · autenticación ·
autorización · validación · bordes · errores · integridad · concurrencia. Un
endpoint no está cubierto hasta que las nueve tienen veredicto, incluido "no
aplica porque X".

**2. `200 OK` no es evidencia.** Todo test que escribe afirma en tres capas:
respuesta → contrato → fuente de verdad. La tercera es la que atrapa el `201`
que no guardó nada.

**3. Control positivo.** Todo test de rechazo demuestra primero que la operación
*era* posible para quien corresponde. Sin eso, un test de seguridad contra una
ruta mal escrita pasa en verde probando nada — y el verde se ve idéntico.

**4. Nunca hacer pasar un test debilitándolo.** Si el servicio se rompió, el test
se queda rojo y se reporta el bug.

**5. La frase que hay que dejar dicha:** pedir *"hacé que pase"* empuja al agente
contra su propio contrato. Lo correcto es **"decime por qué no pasa"**.

---

## Las dos primeras semanas

### Semana 1 — un recurso, completo

Elegí **un** recurso que mueva plata o datos personales y cubrí las nueve
dimensiones enteras. Un recurso completo enseña más y convence más que doce
recursos con happy path.

Al final de la semana tenés que poder mostrar tres cosas:

- La matriz de `docs/qa/api/cobertura.md` con una fila 100 % verde
- Al menos un bug real encontrado (casi siempre aparece en D4 o D8)
- La demostración de que los tests **se ponen rojos**: rompé el filtro de
  autorización delante del equipo y mostrá el rojo

Ese tercer punto es el que convierte escépticos.

### Semana 2 — seguridad en todo lo demás

```
/security-penetration-tester los endpoints de <recurso>
```

Con el catálogo entero, no con lo que "parece más probable": lo improbable es
exactamente lo que nadie probó. Recorré todos los recursos, aunque sea sólo
S1 (IDOR) y S5 (autorización de función). Son los dos que más incidentes evitan
por hora invertida.

---

## Sobre una suite que ya existe

No la reescribas. Medí primero:

```
/backend-standards-enforcer sobre tests/api/ entero. Es una suite vieja que
nunca siguió el estándar — quiero saber el tamaño del problema antes de
arreglarlo, priorizado.
```

Y después, en este orden y sin saltear:

1. **Rotar las credenciales que aparezcan en el código.** Sacarlas no alcanza:
   ya están en el historial de git.
2. **Los tests que no pueden fallar.** Arreglarlos o borrarlos. Un test verde
   que pasa con el servicio roto es peor que ningún test: ocupa el lugar de la
   cobertura sin darla.
3. **Capa 3 en los endpoints `@critico`.** El resto, a medida que se toquen.
4. **El contrato estricto**, con `API_CONTRATO_LAXO=1` **y fecha de
   vencimiento escrita**. No es una configuración: es una muleta.

Nada de "migrar toda la suite". Se convierte en un proyecto de tres meses que
nadie termina.

---

## Cómo hacer que sobreviva

| Práctica | Por qué |
|---|---|
| `test:api:smoke` en cada push | Detecta el ambiente roto antes que las personas |
| `test:api:critico` y `@seguridad` en cada PR | Menos de 10 minutos, o el equipo lo saltea |
| Suite completa nightly | Ahí van `@integridad`, `@concurrencia` y `@lento` |
| `coverage-critic-agent` antes de cada release | Encuentra los tests que no pueden fallar |
| `.claude/backend-testing-kit.version` commiteado | Es lo que dice qué versión tiene cada repo |
| El estándar se discute, no se impone | Si una regla no funciona en un proyecto, eso es información sobre la regla: PR al kit |

**Los dos síntomas de que la adopción se está muriendo:**

1. Alguien pide `API_CONTRATO_LAXO=1` permanente
2. Aparecen `test.skip` sin motivo escrito

Los dos significan lo mismo: la suite empezó a estorbar en vez de proteger. La
respuesta no es aflojar la norma — es arreglar lo que la suite está señalando, o
cambiar la regla en el kit, a la vista de todos.

---

## Qué NO hacer

- **No arranques por el servicio más crítico.** Arrancá por el que se puede romper.
- **No apuntes a producción**, ni "para probar rápido". El guardarraíl corta, pero
  no lo uses como criterio: usalo como red.
- **No midas cobertura de líneas.** Se puede tener 90 % y cero tests de
  autorización. La cobertura es la matriz de dimensiones.
- **No pidas 400 casos negativos.** Clases de equivalencia más los bordes. Una
  suite que nadie mantiene se borra entera en seis meses.
- **No dejes que el agente commitee.** El commit lo decide una persona.
