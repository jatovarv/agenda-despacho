# Agenda del Despacho

Aplicación de gestión de agenda, salas y atención a clientes del despacho. Este repositorio contiene el código fuente de la aplicación, scripts de administración y documentación técnica de la implementación.

## Estructura del Repositorio

La arquitectura del proyecto está organizada en las siguientes carpetas principales para brindar claridad:

- `/src` : Contiene todo el código fuente de la aplicación web (Next.js, componentes UI, base de datos, hooks y utilidades).
- `/docs` : Contiene los documentos técnicos, guías de instalación y manuales (como `LEEME-WINDOWS.md` y `README-TECNICO-WINDOWS.md`).
- `/scripts` : Contiene scripts de automatización para Windows (PowerShell/CMD) y utilidades de Node.js para despliegue, respaldo y restauración de la base de datos local.
- `/tests` : Contiene las pruebas de integración.

## Arquitectura de la Aplicación

La aplicación web está desarrollada con **Node.js 24**, **Next.js** y **SQLite**. Está diseñada para ejecutarse en un entorno local (o servidor interno Windows) y ser accedida a través de la red del despacho por los navegadores del personal.

- **Frontend**: Next.js (React), Tailwind CSS, componentes UI en `/src/components`.
- **Backend**: Rutas API de Next.js en `/src/app/api`, interactuando con SQLite local mediante `drizzle-orm`.
- **Persistencia**: La base de datos es un archivo `.sqlite` local gestionado mediante `src/db/sqlite.mjs`, lo que elimina la necesidad de servidores de base de datos adicionales.
- **Seguridad**: Todas las consultas y validaciones se efectúan mediante consultas preparadas en Drizzle/SQLite para prevenir inyección SQL.

Para información más detallada sobre instalación en Windows, respaldo y scripts disponibles, por favor consulta la carpeta `/docs`.
