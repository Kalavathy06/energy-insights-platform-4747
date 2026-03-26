#!/bin/bash
cd /home/kavia/workspace/code-generation/energy-insights-platform-4747/frontend_dashboard
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

