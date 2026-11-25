# -*- coding: utf-8 -*-
import os, sys, io
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, List

from engine import ProcessMiningEngine

app = FastAPI(
    title="Process Mining Graph Reconstruction API",
    description="Модуль автоматизированной реконструкции и визуализации графов бизнес-процессов по журналам событий",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if not request.url.path.startswith("/libs/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response

engine = ProcessMiningEngine()

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOCAL_LOGS_DIR = os.path.join(BASE_DIR, "примеры_логов")
PARENT_LOGS_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "примеры_логов"))
LOGS_DIR = LOCAL_LOGS_DIR if os.path.exists(LOCAL_LOGS_DIR) else PARENT_LOGS_DIR

PRESETS = {
    "1c_erp": {
        "id": "1c_erp",
        "name": "1С:ERP Заказ клиента (Order-to-Cash)",
        "file": "1C_ERP_Заказ_Клиента.csv",
        "type": "csv",
        "default_mapping": {
            "case_col": "НомерЗаказа",
            "act_col": "Статус",
            "time_col": "ДатаВремя",
            "res_col": "Ответственный"
        },
        "description": "Сквозной процесс обработки заказов в 1С: согласования, оплата, склад, доставка, закрытие документов."
    },
    "servicedesk": {
        "id": "servicedesk",
        "name": "Service Desk Инциденты (ITIL ITSM)",
        "file": "ServiceDesk_Инциденты_ITSM.csv",
        "type": "csv",
        "default_mapping": {
            "case_col": "Ticket_ID",
            "act_col": "Activity",
            "time_col": "Timestamp",
            "res_col": "Assignee"
        },
        "description": "Жизненный цикл инцидентов технической поддержки: классификация, Tier 1, эскалация Tier 2, закрытие."
    },
    "bank_loan": {
        "id": "bank_loan",
        "name": "Банковский кредитный конвейер",
        "file": "Банк_Кредитный_Конвейер.csv",
        "type": "csv",
        "default_mapping": {
            "case_col": "ЗаявкаID",
            "act_col": "Действие",
            "time_col": "Время",
            "res_col": "Сотрудник"
        },
        "description": "Конвейер кредитного скоринга: скоринг, БКИ, андеррайтинг, проверка СБ, выдача."
    },
    "ieee_xes": {
        "id": "ieee_xes",
        "name": "Эталонный XES (стандарт IEEE 1849-2016)",
        "file": "Эталонный_Процесс_1С_IEEE_1849.xes",
        "type": "xes",
        "default_mapping": {
            "case_col": "case_id",
            "act_col": "activity",
            "time_col": "timestamp",
            "res_col": "resource"
        },
        "description": "Международный формат XML XES с пространствами имен concept, time, org."
    }
}

class MapRequest(BaseModel):
    case_col: str
    act_col: str
    time_col: str
    res_col: Optional[str] = None

class BuildGraphRequest(BaseModel):
    node_threshold_pct: float = 0.0
    edge_threshold_pct: float = 0.0

@app.get("/api/v1/health")
def health_check():
    return {"status": "ok", "service": "Process Mining Core Engine"}

@app.get("/api/v1/logs/presets")
def get_presets():
    """Список предустановленных датасетов для быстрой демонстрации"""
    return list(PRESETS.values())

@app.post("/api/v1/logs/load-preset/{preset_id}")
def load_preset(preset_id: str):
    """Мгновенная загрузка предустановленного датасета с готовым маппингом"""
    if preset_id not in PRESETS:
        raise HTTPException(status_code=404, detail="Предустановленный лог не найден")
    
    preset = PRESETS[preset_id]
    fpath = os.path.join(LOGS_DIR, preset["file"])
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="Файл датасета отсутствует на диске")

    if preset["type"] == "xes":
        metrics = engine.load_xes(fpath)
    else:
        engine.load_csv(fpath)
        m = preset["default_mapping"]
        metrics = engine.process_traces(m["case_col"], m["act_col"], m["time_col"], m.get("res_col"))

    graph_res = engine.build_dfg(node_threshold_pct=0.0, edge_threshold_pct=5.0)

    return {
        "preset": preset,
        "metrics": metrics,
        "columns": engine.columns,
        "graph": graph_res["graph"]
    }

@app.post("/api/v1/logs/upload")
async def upload_log(file: UploadFile = File(...)):
    """Загрузка пользовательского CSV или XES файла"""
    content = await file.read()
    filename = file.filename.lower()

    if filename.endswith(".xes"):
        metrics = engine.load_xes(io.BytesIO(content))
        graph_res = engine.build_dfg(node_threshold_pct=0.0, edge_threshold_pct=5.0)
        return {
            "type": "xes",
            "metrics": metrics,
            "columns": engine.columns,
            "graph": graph_res["graph"]
        }
    elif filename.endswith(".json"):
        text = content.decode("utf-8", errors="ignore")
        preview_data = engine.load_json(text)
        return {
            "type": "json",
            "columns": preview_data["columns"],
            "total_rows": preview_data["total_rows"],
            "preview": preview_data["preview"]
        }
    else:
        text_stream = io.StringIO(content.decode("utf-8", errors="ignore"))
        preview_data = engine.load_csv(text_stream)
        return {
            "type": "csv",
            "columns": preview_data["columns"],
            "total_rows": preview_data["total_rows"],
            "preview": preview_data["preview"]
        }

@app.post("/api/v1/logs/map")
def map_columns(req: MapRequest):
    """Применение маппинга колонок к загруженному CSV логу"""
    try:
        metrics = engine.process_traces(
            case_col=req.case_col,
            act_col=req.act_col,
            time_col=req.time_col,
            res_col=req.res_col
        )
        graph_res = engine.build_dfg(node_threshold_pct=0.0, edge_threshold_pct=5.0)
        return {
            "metrics": metrics,
            "graph": graph_res["graph"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/v1/graph/build")
def build_graph(req: BuildGraphRequest):
    """Пересчет графа DFG с новыми порогами фильтрации узлов и ребер"""
    try:
        graph_res = engine.build_dfg(
            node_threshold_pct=req.node_threshold_pct,
            edge_threshold_pct=req.edge_threshold_pct
        )
        return graph_res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/v1/graph/export")
def export_graph(format: str = "json", node_threshold_pct: float = 0.0, edge_threshold_pct: float = 0.0):
    """Экспорт реконструированного графа в формат BPMN 2.0 XML или JSON Graph Format"""
    graph_res = engine.build_dfg(node_threshold_pct=node_threshold_pct, edge_threshold_pct=edge_threshold_pct)
    
    if format == "bpmn":
        xml_content = engine.export_bpmn(graph_res)
        return Response(
            content=xml_content,
            media_type="application/xml",
            headers={"Content-Disposition": "attachment; filename=process_model.bpmn"}
        )
    else:
        return JSONResponse(
            content=graph_res,
            headers={"Content-Disposition": "attachment; filename=process_graph.json"}
        )

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

@app.get("/workbench")
def get_workbench():
    return FileResponse(os.path.join(FRONTEND_DIR, "workbench.html"))

if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
