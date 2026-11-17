# SENA · Control de Ambientes de Formación

Sistema de inventario, control de ambientes y registro de sesiones para el **Centro de Gestión
Agroempresarial del Oriente – Vélez (Regional Santander)**. Proyecto formativo ADSO.

El QR es la identidad del objeto y del ambiente: se imprime una vez y se pega en la puerta o en el
equipo. El instructor escanea, firma y el sistema deja trazabilidad de quién estuvo en cada
ambiente y con qué ficha.

---

## ¿Qué incluye esta Fase 1?

| Módulo | Qué hace |
|---|---|
| **Inventario** | Objetos con QR, placa opcional (S/P), categoría, ambiente, estado, condición, criticidad, consumibles e historial de movimientos. |
| **Ambientes** | Catálogo de aulas, talleres y laboratorios con su QR y capacidad. |
| **Fichas y programas** | Catálogo formativo: crear fichas (7–8 dígitos) y programas, activarlas o desactivarlas sin tocar SQL. |
| **Control de acceso** | Entrada y salida del instructor por ambiente, con ficha, programa y **firma digital**. |
| **Etiquetas** | Generación e impresión de etiquetas QR para ambientes y objetos. |
| **Importar planilla** | Digitaliza la planilla de papel de 9 columnas sin perder el dato original (bandeja de staging + conciliación + migración). |
| **Seguridad** | Login propio con usuario + PIN (bcrypt), sesión JWT en cookie httpOnly y roles. |
| **Panel** | Objetos activos, sesiones abiertas, novedades y últimos registros. |

---

## Stack

- **Next.js 14** (App Router, Server Actions, TypeScript)
- **PostgreSQL en Neon** (conexión directa con `pg`)
- **Vercel** (hosting)
- CSS propio (sin frameworks)
- `qrcode` (QR en PNG), `html5-qrcode` (lectura con cámara), `bcryptjs` + `jose` (auth)

---

## Estructura

```
sena-almacen/
├─ src/
│  ├─ actions/           # server actions (auth, objetos, ambientes, fichas, sesiones, importar)
│  ├─ app/
│  │  ├─ (app)/          # rutas protegidas: panel, inventario, ambientes, fichas, acceso, etiquetas, importar
│  │  ├─ api/qr/         # generador de QR (PNG)
│  │  ├─ login/
│  │  └─ globals.css
│  ├─ components/        # Nav, ScanQR, FirmaPad, Alerta, AreaPlanilla...
│  ├─ lib/               # db (pg), auth, utils
│  └─ middleware.ts      # protege todas las rutas
├─ db/schema.sql         # esquema completo (tablas e índices)
├─ scripts/db-setup.mjs  # aplica el esquema en la base
├─ scripts/seed.mjs      # datos base + usuario administrador
├─ scripts/hash.mjs      # genera hash bcrypt de un PIN
└─ .env.example
```

---

## Puesta en marcha local

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear la base de datos en Neon

1. Entra a <https://console.neon.tech> y abre tu proyecto (o crea uno gratuito).
2. Crea una base llamada `sena_almacen`.
3. En **Dashboard → Connection string** copia la cadena (empieza por `postgresql://…`).
   Usa la cadena con `-pooler` para producción.

> El sistema usa una base aparte. Si ya tienes otro proyecto en Neon, no mezcles las tablas:
> crea `sena_almacen` y apunta ahí `DATABASE_URL`.

### 3. Configurar variables de entorno

Copia `.env.example` a `.env.local` y completa:

```env
DATABASE_URL=postgresql://usuario:clave@ep-xxxx-pooler.us-east-2.aws.neon.tech/sena_almacen?sslmode=require
PGSSL=require

AUTH_SECRET=una-cadena-larga-y-aleatoria

ADMIN_USER=admin
ADMIN_PIN=1234
ADMIN_NOMBRE=Administrador SENA
```

> `AUTH_SECRET` puede ser cualquier cadena larga. En producción cámbiala.
> `PGSSL` es opcional: `require` fuerza SSL (Neon lo exige) y `disable` lo apaga en Postgres local.

### 4. Crear las tablas y los datos base

```bash
npm run db:setup   # aplica db/schema.sql (se puede repetir sin daño)
npm run seed       # roles, programas, ficha, categorías, ambientes y administrador
```

El seed crea:

- 3 roles: `administrador`, `almacenista`, `instructor`
- Programas: ADSO, Técnico en Sistemas, Técnico en Agropecuaria
- Ficha de ejemplo: **3535013** (ADSO, mañana)
- 8 categorías de inventario
- 12 ambientes (101–104, 201–204, 206, 207, 209 y almacén)
- Usuario administrador (`admin` / PIN de `ADMIN_PIN`)

Para restablecer el PIN del administrador (PowerShell):

```powershell
$env:RESET_PIN=1; npm run seed; Remove-Item Env:RESET_PIN
```

En Linux/macOS: `RESET_PIN=1 npm run seed`.

### 5. Ejecutar

```bash
npm run dev
```

Abre <http://localhost:3000> e ingresa con `admin` y tu PIN.

---

## Despliegue en Vercel

1. Sube el proyecto a GitHub:

   ```bash
   git init
   git add .
   git commit -m "MVP control de ambientes SENA"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/sena-almacen.git
   git push -u origin main
   ```

2. En <https://vercel.com> → **Add New → Project** → importa el repositorio.
3. En **Environment Variables** agrega `DATABASE_URL` y `AUTH_SECRET` (las mismas de
   `.env.local`). No subas `.env.local` al repo. Las variables `ADMIN_*` solo son necesarias si
   vas a correr el seed desde local contra la base de producción.
4. **Deploy**. Vercel detecta Next.js automáticamente.
5. Abre la URL de producción e inicia sesión.

> El esquema y el seed se corren **desde tu computador** apuntando a la misma base de Neon; no es
> necesario ejecutarlos en Vercel.

---

## Cómo se usa

### Registrar ambientes y objetos

1. **Ambientes → Crear ambiente**: código (`203`), nombre y tipo.
2. **Etiquetas → Ambientes → Imprimir**: pega el QR en la puerta del ambiente.
3. **Inventario → Registrar objeto**: nombre, placa (o `S/P`), categoría, ambiente.
4. **Etiquetas → Objetos → Imprimir**: pega el QR en el equipo.

### Crear fichas y programas

1. **Fichas → Crear programa**: código (`228106`), nombre y nivel.
2. **Fichas → Crear ficha**: código de 7 u 8 dígitos, jornada y programa.
3. Usa **Desactivar** cuando una ficha termine su etapa; deja de aceptar entradas pero conserva su
   historial. Los programas se pueden crear antes o después de las fichas.

> Sin la ficha registrada y activa, el sistema rechaza el registro de entrada. Esta pantalla evita
> tener que ejecutar SQL para cada ficha nueva.

### Registrar entrada y salida

1. El instructor abre **Acceso** en el celular.
2. Escanea el QR del ambiente (o lo selecciona).
3. Escribe la ficha (`3535013`), su nombre y, si aplica, el programa.
4. Firma en pantalla y pulsa **Registrar entrada**.
5. Al terminar, en **Sesiones abiertas** selecciona el tipo de novedad (si hubo) y pulsa
   **Registrar salida**.

Reglas:

- No puede haber dos sesiones abiertas del mismo instructor en el mismo ambiente.
- La ficha debe existir y estar activa.
- La firma es obligatoria, salvo que se marque la excepción (queda registrada como `ninguna`).
- Si el instructor no existe, se crea automáticamente para revisión posterior.

### Importar la planilla de papel

La planilla oficial tiene 9 columnas:

```
FECHA | FICHA | NOMBRES Y APELLIDOS | PROGRAMA DE FORMACIÓN | NOMBRE DE AMBIENTE |
HORA DE ENTRADA | HORA DE SALIDA | FIRMA | OBSERVACIONES
```

1. **Importar → 1. Cargar la planilla**: pega desde Excel (tabulaciones) o carga un CSV.
2. **2. Conciliar pendientes**: el sistema busca ficha, instructor, programa y ambiente.
   - Fechas aceptadas: `26/08/2026`, `26-08-26`, `2026-08-26` o serial de Excel.
   - Horas aceptadas: `7:00`, `07:00`, `1:00 pm`, `6.00 p.m.`.
   - Ambiente acepta código (`203`) o nombre (`Sistemas`); puede venir vacío.
3. **3. Migrar filas listas**: crea las sesiones con `origen = 'migrado_papel'` y conserva el texto
   original de cada columna para auditoría.

Estados de una fila: `pendiente`, `listo`, `migrado`, `duplicado`, `descartado` y los errores
específicos (`fecha_invalida`, `hora_invalida`, `ficha_no_encontrada`, `instructor_no_encontrado`,
`programa_no_coincide`, `ambiente_no_encontrado`).

---

## Modelo de datos (resumen)

| Tabla | Para qué |
|---|---|
| `persona` | Instructores, aprendices, funcionarios y visitantes. |
| `usuario` / `rol` | Acceso al sistema y permisos. |
| `programa` / `ficha` | Catálogo formativo. La ficha es texto de 7 u 8 dígitos. |
| `ambiente` | Aula, taller, laboratorio u oficina, con `codigo_qr`. |
| `objeto` / `placa` | Inventario. El QR es la identidad; la placa es atributo opcional. |
| `objeto_historial` | Creación, traslado, mantenimiento, baja, pérdida. |
| `sesion_ambiente` | Una fila por sesión diaria: entrada, salida, firma y estado. |
| `novedad` | Faltante, daño, sobrante o desorden detectado. |
| `mision_restauracion` / `puntos_ecologicos` | Sanciones ecológicas (traer planta) sin dinero. |
| `stg_planilla_papel` | Bandeja de digitalización del papel. |
| `auditoria` / `configuracion` | Trazabilidad y parámetros. |

El esquema completo está en `db/schema.sql`. Todas las fechas se manejan en
**America/Bogota** y las columnas `date` se leen como texto ISO para no correr el día.

---

## Seguridad y Ley 1581 de 2012

- La base de datos **solo se consulta desde el servidor** con la cadena `DATABASE_URL`. El navegador
  nunca recibe credenciales de la base.
- Las contraseñas son PIN con hash **bcrypt**; la sesión es un JWT firmado en cookie `httpOnly`.
- La firma del instructor se guarda **dentro de la misma base** (columna `firma_url`, como dataURL)
  junto a su hash SHA-256, y solo debe usarse para validar la sesión. No se sube a ningún servicio
  externo, así el respaldo viaja completo con la base.
- No hay límite de intentos fallidos en el login ni bloqueo temporal de la cuenta. Si el sistema se
  expone a Internet, agrega *rate limiting* (por ejemplo en Vercel o un middleware con conteo por IP).
- Antes de usar datos reales, informa a instructores y aprendices el tratamiento de sus datos y
  define quién es el responsable en el centro.
- **Fase 2 (biometría)** requiere consentimiento explícito y medidas adicionales; no está incluida.

---

## Limitaciones conocidas de esta fase

- No hay pantalla para que cada usuario cambie su PIN (se hace con `npm run seed` / SQL).
- No hay recuperación de contraseña por correo.
- La lectura de QR usa la cámara del navegador; en iPhone requiere HTTPS (Vercel ya lo da).
- Las firmas viven en la base como texto: mantén un respaldo (`pg_dump`) y evita sesiones con
  firmas enormes (el pad ya limita el tamaño).
- **Importación**: la conciliación procesa hasta 1000 filas pendientes y la migración hasta 300
  filas listas por clic. Para planillas más grandes, repite los botones hasta terminar. El texto
  pegado se procesa en memoria, así que evita pegar más de ~1 MB de una vez.
- **Conciliación de programas**: si el nombre del programa escrito en el papel no coincide con el de
  la ficha, la fila queda en `programa_no_coincide` para revisión manual; no se adivina.
- No incluye biometría ni sanciones automáticas: las misiones ecológicas quedan en el modelo de
  datos para la siguiente fase.
- No hay generación de reportes en PDF/Excel todavía.

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| “Falta conectar la base de datos” | No existe `.env.local` o falta `DATABASE_URL` | Completa las variables y reinicia `npm run dev`. |
| “relation ... does not exist” | No se aplicó el esquema | Ejecuta `npm run db:setup`. |
| Error de certificado SSL | `PGSSL` mal configurado | Usa `PGSSL=require` con Neon (o quítalo). |
| “Usuario o PIN incorrecto” | El seed no creó el usuario o el PIN cambió | Ejecuta `$env:RESET_PIN=1; npm run seed`. |
| La cámara no abre | Permiso denegado o sin HTTPS | Usa HTTPS (Vercel) o escribe el código a mano. |
| Error al migrar planilla | Ficha o ambiente inexistente | Corrige la fila o usa “Forzar” y completa luego. |

---

## Scripts

```bash
npm run dev        # desarrollo
npm run build      # compilar para producción
npm run start      # servir la compilación
npm run db:setup   # crear/actualizar las tablas en la base
npm run seed       # datos base + administrador
npm run hash 4321  # hash bcrypt de un PIN
```

---

## Siguientes pasos sugeridos

1. Pantalla de usuarios y cambio de PIN.
2. Reportes de horas dictadas por instructor y por ficha.
3. Exportación de inventario a Excel/PDF.
4. Check-in/check-out de objetos por QR con el aprendiz.
5. Misiones ecológicas con evidencia fotográfica.
6. Biometría (solo con consentimiento y cumplimiento de Ley 1581).
