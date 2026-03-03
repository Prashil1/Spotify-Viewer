#!/bin/bash

# Spotify Viewer Control Script
# Usage: ./spotify-viewer.sh start|stop|restart

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BINARY_NAME="spotify-viewer"
PID_FILE="/tmp/spotify-viewer.pid"
PORT=8020

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Check if config.yaml exists
check_config() {
    if [ ! -f "$BACKEND_DIR/config.yaml" ]; then
        print_error "config.yaml not found in $BACKEND_DIR"
        print_info "Please copy config.example.yaml to config.yaml and fill in your Spotify credentials"
        exit 1
    fi
}

# Build frontend
build_frontend() {
    print_info "Building frontend..."
    cd "$FRONTEND_DIR"
    
    if [ ! -d "node_modules" ]; then
        print_info "Installing npm dependencies..."
        npm ci --no-audit --no-fund
    fi
    
    npm run build
    print_success "Frontend built successfully"
}

# Build backend
build_backend() {
    print_info "Building backend..."
    cd "$BACKEND_DIR"
    
    # Copy frontend output to backend
    rm -rf cmd/server/frontend_out || true
    mkdir -p cmd/server/frontend_out
    rsync -a "$FRONTEND_DIR/out/" cmd/server/frontend_out/
    
    # Build the Go binary
    go build -o "$BINARY_NAME" ./cmd/server
    chmod +x "$BINARY_NAME"
    
    print_success "Backend built successfully"
}

# Start the server
start_server() {
    check_config
    
    # Check if already running
    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(<"$PID_FILE")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            print_error "Server is already running (PID: $OLD_PID)"
            echo "Use './spotify-viewer.sh restart' to restart the server"
            exit 1
        else
            # Remove stale PID file
            rm -f "$PID_FILE"
        fi
    fi
    
    print_info "Building frontend and backend..."
    build_frontend
    build_backend
    
    print_info "Starting Spotify Viewer on http://127.0.0.1:$PORT"
    
    cd "$BACKEND_DIR"
    
    # Start the server as a detached background process with nohup
    nohup env FRONTEND_BASE=http://127.0.0.1:$PORT ./"$BINARY_NAME" -config config.yaml > /tmp/spotify-viewer.log 2>&1 &
    
    SERVER_PID=$!
    echo "$SERVER_PID" > "$PID_FILE"
    
    print_success "Server started with PID: $SERVER_PID"
    print_info "Access the app at http://127.0.0.1:$PORT"
    print_info "Logs are available at: /tmp/spotify-viewer.log"
}

# Stop the server
stop_server() {
    if [ ! -f "$PID_FILE" ]; then
        print_error "No PID file found. Server may not be running"
        exit 1
    fi
    
    PID=$(<"$PID_FILE")
    
    if ! kill -0 "$PID" 2>/dev/null; then
        print_error "Server is not running (PID: $PID)"
        rm -f "$PID_FILE"
        exit 1
    fi
    
    print_info "Stopping server (PID: $PID)..."
    kill "$PID"
    
    # Wait for process to terminate
    count=0
    while kill -0 "$PID" 2>/dev/null && [ $count -lt 10 ]; do
        sleep 0.5
        count=$((count + 1))
    done
    
    # Force kill if still running
    if kill -0 "$PID" 2>/dev/null; then
        print_info "Force killing process..."
        kill -9 "$PID"
    fi
    
    print_success "Server stopped"
    
    # Clean up binaries and build files
    print_info "Cleaning up binaries and build files..."
    
    # Remove backend binary
    cd "$BACKEND_DIR"
    rm -f "$BINARY_NAME"
    print_success "Removed backend binary"
    
    # Remove frontend build output
    rm -rf "$FRONTEND_DIR/out"
    rm -rf "$FRONTEND_DIR/.next"
    print_success "Removed frontend build files"
    
    # Remove PID file
    rm -f "$PID_FILE"
    
    print_success "Cleanup completed"
}

# Restart the server
restart_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(<"$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            stop_server
        fi
    fi
    
    print_info "Restarting server..."
    sleep 1
    start_server
}

# Show usage
show_usage() {
    echo "Spotify Viewer Control Script"
    echo ""
    echo "Usage: $0 {start|stop|restart}"
    echo ""
    echo "Commands:"
    echo "  start   - Build frontend and backend, then start the server"
    echo "  stop    - Stop the server and clean up binaries"
    echo "  restart - Restart the server"
    echo ""
    echo "The server will be available at: http://127.0.0.1:$PORT"
}

# Main script
case "$1" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
