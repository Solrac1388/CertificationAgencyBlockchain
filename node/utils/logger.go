package utils

import (
    "fmt"
    "os"
    "runtime"
    "strings"
    "sync"
    "time"
    
    "github.com/sirupsen/logrus"
)

// Logger wraps logrus logger with additional functionality
type Logger struct {
    *logrus.Logger
    mu sync.Mutex
}

// LogLevel represents the logging level
type LogLevel string

const (
    DebugLevel LogLevel = "debug"
    InfoLevel  LogLevel = "info"
    WarnLevel  LogLevel = "warn"
    ErrorLevel LogLevel = "error"
    FatalLevel LogLevel = "fatal"
)

// NewLogger creates a new logger instance
func NewLogger(debug bool) *Logger {
    log := logrus.New()
    
    // Set formatter
    log.SetFormatter(&logrus.TextFormatter{
        FullTimestamp:   true,
        TimestampFormat: "2006-01-02 15:04:05",
        DisableColors:   false,
        ForceColors:     true,
    })
    
    // Set output
    log.SetOutput(os.Stdout)
    
    // Set level
    if debug {
        log.SetLevel(logrus.DebugLevel)
    } else {
        log.SetLevel(logrus.InfoLevel)
    }
    
    return &Logger{Logger: log}
}

// Debug logs a debug message
func (l *Logger) Debug(format string, args ...interface{}) {
    l.mu.Lock()
    defer l.mu.Unlock()
    
    l.WithFields(l.getCallerInfo()).Debugf(format, args...)
}

// Info logs an info message
func (l *Logger) Info(format string, args ...interface{}) {
    l.mu.Lock()
    defer l.mu.Unlock()
    
    l.WithFields(l.getCallerInfo()).Infof(format, args...)
}

// Warn logs a warning message
func (l *Logger) Warn(format string, args ...interface{}) {
    l.mu.Lock()
    defer l.mu.Unlock()
    
    l.WithFields(l.getCallerInfo()).Warnf(format, args...)
}

// Error logs an error message
func (l *Logger) Error(format string, args ...interface{}) {
    l.mu.Lock()
    defer l.mu.Unlock()
    
    l.WithFields(l.getCallerInfo()).Errorf(format, args...)
}

// Fatal logs a fatal message and exits
func (l *Logger) Fatal(format string, args ...interface{}) {
    l.mu.Lock()
    defer l.mu.Unlock()
    
    l.WithFields(l.getCallerInfo()).Fatalf(format, args...)
}

// WithField adds a field to the logger
func (l *Logger) WithField(key string, value interface{}) *logrus.Entry {
    return l.Logger.WithField(key, value)
}

// WithFields adds multiple fields to the logger
func (l *Logger) WithFields(fields map[string]interface{}) *logrus.Entry {
    return l.Logger.WithFields(fields)
}

// getCallerInfo returns information about the calling function
func (l *Logger) getCallerInfo() logrus.Fields {
    pc, file, line, ok := runtime.Caller(2)
    if !ok {
        return logrus.Fields{}
    }
    
    function := runtime.FuncForPC(pc).Name()
    
    // Extract just the function name
    parts := strings.Split(function, "/")
    if len(parts) > 0 {
        function = parts[len(parts)-1]
    }
    
    // Extract just the filename
    parts = strings.Split(file, "/")
    if len(parts) > 0 {
        file = parts[len(parts)-1]
    }
    
    return logrus.Fields{
        "file":     fmt.Sprintf("%s:%d", file, line),
        "function": function,
    }
}

// SetLevel sets the logging level
func (l *Logger) SetLevel(level LogLevel) {
    switch level {
    case DebugLevel:
        l.Logger.SetLevel(logrus.DebugLevel)
    case InfoLevel:
        l.Logger.SetLevel(logrus.InfoLevel)
    case WarnLevel:
        l.Logger.SetLevel(logrus.WarnLevel)
    case ErrorLevel:
        l.Logger.SetLevel(logrus.ErrorLevel)
    case FatalLevel:
        l.Logger.SetLevel(logrus.FatalLevel)
    default:
        l.Logger.SetLevel(logrus.InfoLevel)
    }
}

// Benchmark logs the execution time of a function
func (l *Logger) Benchmark(name string, fn func()) {
    start := time.Now()
    fn()
    duration := time.Since(start)
    
    l.Info("Benchmark [%s] completed in %v", name, duration)
}

// LogRequest logs an HTTP request
func (l *Logger) LogRequest(method, path string, statusCode int, duration time.Duration) {
    fields := logrus.Fields{
        "method":      method,
        "path":        path,
        "status_code": statusCode,
        "duration_ms": duration.Milliseconds(),
    }
    
    if statusCode >= 400 {
        l.WithFields(fields).Warn("HTTP request failed")
    } else {
        l.WithFields(fields).Info("HTTP request completed")
    }
}

// LogError logs an error with context
func (l *Logger) LogError(err error, context string, fields ...map[string]interface{}) {
    if err == nil {
        return
    }
    
    logFields := logrus.Fields{
        "error":   err.Error(),
        "context": context,
    }
    
    if len(fields) > 0 {
        for k, v := range fields[0] {
            logFields[k] = v
        }
    }
    
    l.WithFields(logFields).Error("Error occurred")
}

// NewFileLogger creates a logger that writes to a file
func NewFileLogger(filename string, debug bool) (*Logger, error) {
    file, err := os.OpenFile(filename, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
    if err != nil {
        return nil, fmt.Errorf("failed to open log file: %w", err)
    }
    
    logger := NewLogger(debug)
    logger.SetOutput(file)
    
    return logger, nil
}