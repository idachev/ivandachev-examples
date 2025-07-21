#!/bin/bash
[ "$1" = -x ] && shift && set -x
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set -e

cd "${DIR}/.."

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install Node.js and npm first."
    exit 1
fi

# Install/update npm dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi

# Check Prettier formatting
echo "Checking code formatting with Prettier..."
if ! npm run format:check; then
    echo ""
    echo "❌ Code formatting issues detected!"
    echo "Please run './utils/code-format.sh' to fix formatting issues."
    exit 1
fi

# Check ESLint
echo "Checking JS code ESLint..."
if ! npm run lint; then
    echo ""
    echo "❌ JavaScript linting issues detected!"
    echo "Please run './utils/code-format.sh' to fix linting issues."
    exit 1
fi

# Check Stylelint for CSS files
echo "Checking CSS files with Stylelint..."
if ! npm run lint:css; then
    echo ""
    echo "❌ CSS linting issues detected!"
    echo "Please run './utils/code-format.sh' to fix CSS issues."
    exit 1
fi

echo -e "\n✅ All code checks passed!"