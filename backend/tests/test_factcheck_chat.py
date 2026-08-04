import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_grounded_claim_chat_flow():
    # 1. Submit claim verification
    verify_res = client.post("/api/v1/verify", json={"content": "Emergency bank holiday starting tomorrow"})
    assert verify_res.status_code == 200
    audit_data = verify_res.json()
    audit_id = audit_data["id"]

    # 2. Send follow-up grounded chat message
    chat_payload = {"message": "Why is this claim false according to sources?"}
    chat_res = client.post(f"/api/v1/factcheck/{audit_id}/chat", json=chat_payload)
    assert chat_res.status_code == 200
    chat_data = chat_res.json()
    assert chat_data["fact_check_id"] == audit_id
    assert "reply" in chat_data
    assert len(chat_data["reply"]) > 0

    # 3. Retrieve session chat history
    history_res = client.get(f"/api/v1/factcheck/{audit_id}/chat")
    assert history_res.status_code == 200
    history_data = history_res.json()
    assert history_data["fact_check_id"] == audit_id
    assert len(history_data["messages"]) >= 2
    assert history_data["messages"][0]["role"] == "user"
    assert history_data["messages"][1]["role"] == "assistant"
