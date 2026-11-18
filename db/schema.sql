-- ============================================================
--  SENA · Almacén — Esquema MVP Fase 1 (PostgreSQL / Neon)
--  Aplicar con:  npm run db:setup
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------- SEGURIDAD -------------------------
create table if not exists rol (
  id          serial primary key,
  nombre      text unique not null,
  descripcion text,
  permisos    jsonb not null default '{}'::jsonb
);

create table if not exists persona (
  id               uuid primary key default gen_random_uuid(),
  tipo_documento   text not null default 'CC',
  numero_documento text unique,
  nombres          text not null,
  apellidos        text not null,
  email            text,
  telefono         text,
  tipo_persona     text not null default 'aprendiz'
    check (tipo_persona in ('instructor','aprendiz','funcionario','contratista','visitante','vigilancia')),
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists usuario (
  id            uuid primary key default gen_random_uuid(),
  persona_id    uuid references persona(id),
  username      text unique not null,
  pin_hash      text not null,
  rol_id        int references rol(id),
  activo        boolean not null default true,
  ultimo_login  timestamptz,
  created_at    timestamptz not null default now()
);

-- ------------------------- CATÁLOGOS -------------------------
create table if not exists programa (
  id      serial primary key,
  codigo  text unique not null,
  nombre  text not null,
  nivel   text not null default 'tecnologo'
    check (nivel in ('tecnico','tecnologo','especializacion','curso')),
  activo  boolean not null default true
);

create table if not exists ficha (
  id            serial primary key,
  codigo        text unique not null check (codigo ~ '^\d{7,8}$'),
  programa_id   int references programa(id),
  jornada       text not null default 'mañana'
    check (jornada in ('mañana','tarde','noche','mixta')),
  fecha_inicio  date,
  fecha_fin     date,
  activa        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists ambiente (
  id          serial primary key,
  codigo      text unique not null,
  nombre      text not null,
  bloque      text,
  piso        int,
  capacidad   int,
  tipo        text not null default 'aula'
    check (tipo in ('aula','taller','laboratorio','almacen','oficina','zona_comun')),
  codigo_qr   text unique not null,
  responsable_id uuid references persona(id),
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists categoria (
  id                 serial primary key,
  nombre             text unique not null,
  categoria_padre_id int references categoria(id),
  activo             boolean not null default true
);

-- ------------------------- INVENTARIO -------------------------
create table if not exists placa (
  id               serial primary key,
  valor            text unique not null,
  valor_original   text,
  tiene_conflicto  boolean not null default false,
  observacion      text,
  created_at       timestamptz not null default now()
);

create table if not exists objeto (
  id              bigserial primary key,
  codigo_qr       text unique not null,
  codigo_interno  text unique not null,
  placa_id        int references placa(id),
  placa_original  text,
  es_sp           boolean not null default false,
  nombre          text not null,
  descripcion     text,
  categoria_id    int references categoria(id),
  ambiente_id     int references ambiente(id),
  estado          text not null default 'disponible'
    check (estado in ('disponible','en_uso','prestado','mantenimiento','baja','perdido')),
  condicion       text not null default 'bueno'
    check (condicion in ('bueno','regular','malo')),
  criticidad      text not null default 'media'
    check (criticidad in ('alta','media','baja')),
  es_consumible   boolean not null default false,
  cantidad_actual int not null default 1,
  stock_minimo    int,
  foto_url        text,
  observaciones   text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists objeto_historial (
  id                  bigserial primary key,
  objeto_id           bigint references objeto(id),
  tipo_evento         text not null
    check (tipo_evento in ('creacion','traslado','prestamo','devolucion','mantenimiento','baja','perdida','ajuste')),
  ambiente_origen_id  int references ambiente(id),
  ambiente_destino_id int references ambiente(id),
  persona_id          uuid references persona(id),
  detalle             text,
  usuario_id          uuid references usuario(id),
  fecha               timestamptz not null default now()
);

-- ------------------------- CONTROL DE AMBIENTES -------------------------
create table if not exists sesion_ambiente (
  id                        bigserial primary key,
  ambiente_id               int references ambiente(id),
  instructor_id             uuid not null references persona(id),
  ficha_id                  int not null references ficha(id),
  programa_id               int not null references programa(id),
  ambiente_texto_original   text,
  instructor_texto_original text,
  ficha_texto_original      text,
  programa_texto_original   text,
  fecha                     date not null default current_date,
  hora_entrada              timestamptz not null default now(),
  hora_salida               timestamptz,
  estado                    text not null default 'abierta'
    check (estado in ('abierta','cerrada','con_novedad','sin_cierre')),
  firma_url                 text,
  firma_hash                text,
  firma_metodo              text not null default 'ninguna'
    check (firma_metodo in ('canvas','foto_papel','ninguna')),
  observaciones             text,
  origen                    text not null default 'digital'
    check (origen in ('digital','migrado_papel')),
  folio                     text,
  documento_url             text,
  hash_fila                 text unique,
  registrado_por            uuid references usuario(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint ck_ambiente_digital check (
    (origen = 'digital' and ambiente_id is not null) or origen = 'migrado_papel'
  )
);

create unique index if not exists uq_sesion_digital
  on sesion_ambiente (ambiente_id, instructor_id, ficha_id, fecha, hora_entrada)
  where origen = 'digital';

-- Aprendices de turno (los 2 que hacen el inventario del día)
alter table sesion_ambiente add column if not exists aprendices text;

-- ------------------------- VERIFICACIÓN DE INVENTARIO (QR) -------------------------
create table if not exists verificacion (
  id             uuid primary key default gen_random_uuid(),
  sesion_id      bigint references sesion_ambiente(id) on delete cascade,
  ambiente_id    int not null references ambiente(id),
  momento        text not null check (momento in ('entrada','salida')),
  todo_en_orden  boolean not null default true,
  detalle        jsonb not null default '[]'::jsonb,
  aprendices     text,
  observaciones  text,
  firma_url      text,
  firma_hash     text,
  firma_metodo   text not null default 'canvas'
    check (firma_metodo in ('canvas','ninguna')),
  registrado_por uuid references usuario(id),
  created_at     timestamptz not null default now()
);

create index if not exists verificacion_sesion_idx on verificacion (sesion_id);
create index if not exists verificacion_ambiente_idx on verificacion (ambiente_id, created_at desc);

-- ------------------------- NOVEDADES Y MISIONES -------------------------
create table if not exists novedad (
  id               bigserial primary key,
  sesion_id        bigint references sesion_ambiente(id),
  objeto_id        bigint references objeto(id),
  tipo             text not null
    check (tipo in ('faltante','dano','sobrante','desorden')),
  descripcion      text not null,
  evidencia_url    text,
  estado           text not null default 'abierta'
    check (estado in ('abierta','en_proceso','cerrada','anulada')),
  responsable_id   uuid references persona(id),
  creado_por       uuid references usuario(id),
  fecha_apertura   timestamptz not null default now(),
  fecha_cierre     timestamptz
);

create table if not exists mision_restauracion (
  id               bigserial primary key,
  persona_id       uuid not null references persona(id),
  novedad_id       bigint references novedad(id),
  tipo             text not null default 'planta'
    check (tipo in ('planta','limpieza','capacitacion','apoyo')),
  descripcion      text not null,
  fecha_asignacion date not null default current_date,
  fecha_limite     date not null,
  estado           text not null default 'pendiente'
    check (estado in ('pendiente','entregada','validada','vencida','exonerada')),
  puntos           int not null default 0,
  validado_por     uuid references usuario(id),
  fecha_validacion timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists mision_evidencia (
  id          bigserial primary key,
  mision_id   bigint not null references mision_restauracion(id),
  url         text not null,
  tipo        text not null default 'foto' check (tipo in ('foto','video','documento')),
  hash_sha256 text,
  subido_por  uuid references persona(id),
  fecha       timestamptz not null default now()
);

create table if not exists puntos_ecologicos (
  id              bigserial primary key,
  persona_id      uuid not null references persona(id),
  puntos          int not null,
  motivo          text,
  referencia_tipo text,
  referencia_id   bigint,
  fecha           timestamptz not null default now()
);

-- ------------------------- MIGRACIÓN PLANILLA -------------------------
create table if not exists stg_planilla_papel (
  id                 bigserial primary key,
  folio              text,
  fila               int,
  fecha_raw          text,
  ficha_raw          text,
  nombres_raw        text,
  programa_raw       text,
  ambiente_raw       text,
  hora_entrada_raw   text,
  hora_salida_raw    text,
  firma_presente     boolean not null default false,
  observaciones_raw  text,
  documento_url      text,
  hash_fila          text,
  fecha_norm         date,
  hora_entrada_norm  timestamptz,
  hora_salida_norm   timestamptz,
  instructor_id      uuid references persona(id),
  ficha_id           int references ficha(id),
  programa_id        int references programa(id),
  ambiente_id        int references ambiente(id),
  estado_validacion  text not null default 'pendiente'
    check (estado_validacion in (
      'pendiente','ok','fecha_invalida','hora_invalida',
      'instructor_no_encontrado','ficha_no_encontrada',
      'programa_no_coincide','ambiente_no_encontrado',
      'duplicado','listo','migrado','descartado'
    )),
  sesion_id          bigint references sesion_ambiente(id),
  created_at         timestamptz not null default now()
);

-- ------------------------- SISTEMA -------------------------
create table if not exists auditoria (
  id         bigserial primary key,
  usuario_id uuid references usuario(id),
  accion     text not null,
  entidad    text,
  entidad_id text,
  datos      jsonb,
  fecha      timestamptz not null default now()
);

create table if not exists configuracion (
  clave           text primary key,
  valor           text,
  descripcion     text,
  actualizado_por uuid references usuario(id),
  actualizado_en  timestamptz not null default now()
);

-- ------------------------- ÍNDICES -------------------------
create index if not exists idx_objeto_ambiente   on objeto(ambiente_id) where activo;
create index if not exists idx_objeto_categoria  on objeto(categoria_id);
create index if not exists idx_sesion_fecha      on sesion_ambiente(fecha desc);
create index if not exists idx_sesion_instructor on sesion_ambiente(instructor_id, fecha desc);
create index if not exists idx_sesion_abierta    on sesion_ambiente(ambiente_id) where hora_salida is null;
create index if not exists idx_novedad_estado    on novedad(estado) where estado <> 'cerrada';
create index if not exists idx_mision_persona    on mision_restauracion(persona_id, estado);
create index if not exists idx_stg_estado        on stg_planilla_papel(estado_validacion);
