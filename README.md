# CertificationAgencyBlockchain

🇪🇸 [Ver en Español](README.md) | 🇬🇧 [View in English](readme-en.md)

## Descripción

CertificationAgencyBlockchain es un sistema descentralizado para certificar la identidad de los propietarios de claves públicas usando tecnología blockchain con prueba de trabajo. El sistema utiliza la API de Persona Verification para verificar la identidad de los usuarios y asociarla a sus claves públicas, creando así un sistema confiable de certificación de identidades digitales.

## Componentes del Sistema

### App Móvil
- Interfaz de usuario para Persona Verification
- Generador de claves RSA
- Envío de archivos de claves cifrados por email
- Comunicación con los nodos de la blockchain
- Carga y eliminación de certificados existentes

### Nodos Blockchain
- Procesamiento de solicitudes de certificación
- Verificación de identidad mediante Persona API
- Mantenimiento de la blockchain mediante prueba de trabajo
- Base de datos clave-valor para consultas rápidas
- Servicio de consulta de identidades y claves públicas

## Flujo de Trabajo

1. **Verificación de Usuario**: 
   - El usuario accede a la app móvil
   - Completa el proceso de verificación mediante la interfaz de Persona
   - Se genera un código de inquiry (código de sesión)

2. **Generación de Claves**:
   - La app genera un par de claves RSA
   - El par de claves se cifra con una contraseña proporcionada por el usuario
   - El archivo cifrado se envía al email del usuario

3. **Solicitud de Certificación**:
   - La app envía a los nodos: clave pública (id), código de inquiry, y firma RSA
   - Los nodos verifican la solicitud consultando la API de Persona
   - Las solicitudes válidas se añaden a un pool de certificaciones pendientes

4. **Minería de Bloques**:
   - Los nodos participan en la prueba de trabajo para crear nuevos bloques
   - Los bloques contienen las certificaciones validadas
   - La cadena se actualiza y distribuye entre todos los nodos

5. **Consultas**:
   - Los usuarios pueden consultar la identidad asociada a una clave pública
   - Los usuarios pueden consultar la clave pública asociada a una identidad

6. **Gestión de Certificados**:
   - Los usuarios pueden cargar certificados existentes a la aplicación
   - Los usuarios pueden eliminar certificados que ya no necesiten
   - La aplicación sincroniza estos cambios con la red blockchain

## Arquitectura Técnica

### Estructura de la Blockchain
- Bloques enlazados mediante hashes
- Prueba de trabajo para la validación de bloques
- Mecanismo de consenso distribuido

### Integración con Persona API
- Verificación de identidad mediante API REST
- Autenticación segura
- Consulta de estado de verificaciones

### Seguridad
- Cifrado RSA para firmas digitales
- Protección de claves privadas mediante cifrado con contraseña
- Verificación criptográfica de la integridad de la cadena

## Requisitos del Sistema

### Dependencias
- Python 3.8+
- Bibliotecas de criptografía
- Conexión a Internet para acceder a la API de Persona

### Configuración
- Configuración de nodos y puntos de conexión
- Parámetros de dificultad para la prueba de trabajo
- Credenciales de API para Persona Verification

## Instalación y Uso

### Configuración de Nodo
```
python node.py --port=5000
```

El script instalará automáticamente todas las dependencias necesarias en su primera ejecución.

### Ejecución de la App Móvil
La aplicación móvil está disponible para Android y puede descargarse desde este repositorio.

## Desarrollo Futuro
- Integración con otros sistemas de verificación de identidad
- Desarrollo de interfaces web para consultas públicas

## Licencia

Esta obra está bajo una licencia Creative Commons «Atribución-NoComercial-CompartirIgual 4.0 Internacional» (CC BY-NC-SA 4.0).

Esto significa que puedes:
- Compartir: copiar y redistribuir el material en cualquier medio o formato
- Adaptar: remezclar, transformar y construir a partir del material

Bajo los siguientes términos:
- Atribución: Debes dar crédito de manera adecuada, proporcionar un enlace a la licencia e indicar si se han realizado cambios.
- NoComercial: No puedes utilizar el material con fines comerciales.
- CompartirIgual: Si remezclas, transformas o creas a partir del material, debes distribuir tu contribución bajo la misma licencia que el original.

Para más información, visita: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es)