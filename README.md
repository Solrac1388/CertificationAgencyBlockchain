# CertificationAgencyBlockchain

🇪🇸 [Ver en Español](README.md) | 🇬🇧 [View in English](readme-en.md)

## Descripción

CertificationAgencyBlockchain es un sistema descentralizado para certificar la identidad de los propietarios de claves públicas usando tecnología blockchain con prueba de trabajo. El sistema utiliza la API de Persona Verification para verificar la identidad de los usuarios y asociarla a sus claves públicas, creando una alternativa descentralizada a las agencias de certificación tradicionales.

## Motivación

Este proyecto surge como respuesta a las limitaciones de los sistemas de certificación digital centralizados actuales. Mediante tecnología blockchain, busca distribuir la soberanía de la certificación entre múltiples nodos, eliminando la dependencia de una única autoridad y proporcionando mayor transparencia y resistencia a la censura.

## Componentes del Sistema

### App Móvil (React Native)
- Interfaz de usuario para Persona Verification integrada
- Generador de claves RSA con cifrado por contraseña
- Almacenamiento local seguro de certificados
- Descubrimiento automático de nodos en cascada
- Comunicación con la red blockchain mediante UDP/TCP
- Gestión completa del ciclo de vida de certificados

### Nodos Blockchain (Go)
- Procesamiento y validación de solicitudes de certificación
- Verificación de identidad mediante Persona API
- Implementación de prueba de trabajo con ajuste dinámico de dificultad
- Base de datos híbrida: archivos JSON para blockchain + Badger DB para índices
- API REST para comunicación con aplicaciones cliente
- Sincronización peer-to-peer con tolerancia a fallos

## Arquitectura Técnica

### Estructura de la Blockchain
- Bloques enlazados mediante hashes SHA-256
- Prueba de trabajo (PoW) con dificultad objetivo de 10 minutos por bloque
- Árboles de Merkle para garantizar integridad de transacciones
- Ajuste automático de dificultad cada 2016 bloques

### Integración con Persona API
- Verificación de identidad biométrica y documental
- Códigos de inquiry únicos como prueba criptográfica
- Validación de coherencia entre datos verificados y solicitudes

### Seguridad Criptográfica
- Claves RSA de 2048 bits para firmas digitales
- Cifrado AES-256 para protección de claves privadas
- Verificación exhaustiva de firmas en todos los nodos
- Prevención de ataques de replay mediante inquiry únicos

## Flujo de Certificación

1. **Verificación de Identidad**: Usuario completa verificación biométrica con Persona API
2. **Generación de Claves**: App crea par RSA y cifra claves con contraseña del usuario
3. **Solicitud Firmada**: Se genera solicitud con firma RSA de todos los campos
4. **Descubrimiento de Red**: App localiza nodos disponibles mediante broadcast UDP
5. **Validación**: Nodos verifican firma, consultan Persona API y validan unicidad
6. **Minado**: Solicitudes válidas se incluyen en nuevo bloque mediante PoW
7. **Propagación**: Bloque se distribuye y sincroniza entre todos los nodos

## Impacto y Beneficios

### Ventajas Sociales
- **Democratización**: Acceso universal sin barreras geográficas
- **Inclusión Financiera**: Identidad verificable para poblaciones marginadas
- **Portabilidad**: Certificados digitales independientes de documentos físicos
- **Transparencia**: Verificación pública de autenticidad

### Beneficios Medioambientales
- Reducción significativa del consumo de papel
- Eliminación de desplazamientos para trámites presenciales
- Desmaterialización de procesos administrativos

## Requisitos del Sistema

### Nodos
- Go 1.19+
- Docker (opcional)
- Conexión a Internet estable
- Mínimo 2GB RAM, 10GB almacenamiento

### Aplicación Móvil
- Android 13+ 
- 100MB espacio libre
- Cámara para verificación biométrica

## Desarrollo Futuro

- Integración con sistemas de verificación adicionales
- Interfaces web para consultas públicas
- Mecanismos de consenso más eficientes energéticamente
- Escalabilidad horizontal mejorada

## Licencia

Esta obra está bajo una licencia Creative Commons «Atribución-NoComercial-CompartirIgual 4.0 Internacional» (CC BY-NC-SA 4.0).

Para más información: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es)

---

**Trabajo Fin de Grado** - Universidad Politécnica de Madrid  
**Autor**: Carlos Lafuente Sanz  
**Director**: Borja Bordel Sánchez  
**Fecha**: 14 de julio de 2025