"""WebSocket endpoint — basic echo handler for Phase 1."""

import logging
import json
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


async def websocket_endpoint(websocket: WebSocket):
    """Basic WebSocket handler.
    
    Phase 1: Accepts connections, sends welcome message, echoes messages back.
    Phase 2 will add real-time news push notifications.
    """
    await websocket.accept()
    logger.info("WebSocket client connected.")

    try:
        # Send welcome message
        await websocket.send_json({
            "type": "welcome",
            "message": "Connected to Hercules AI news stream.",
        })

        # Echo loop
        while True:
            data = await websocket.receive_text()
            logger.debug(f"WebSocket received: {data}")

            # Echo back with a wrapper
            await websocket.send_json({
                "type": "echo",
                "data": data,
            })

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected.")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
