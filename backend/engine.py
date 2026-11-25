# -*- coding: utf-8 -*-
import os, sys, math, json
from datetime import datetime
import pandas as pd
import xml.etree.ElementTree as ET

class ProcessMiningEngine:
    def __init__(self):
        self.traces = {}
        self.events_count = 0
        self.raw_df = None
        self.columns = []

    def load_csv(self, file_path_or_buffer, delimiter=None):
        """Загрузка CSV файла с автоматическим определением разделителя"""
        if delimiter:
            df = pd.read_csv(file_path_or_buffer, delimiter=delimiter)
        else:
            try:
                df = pd.read_csv(file_path_or_buffer)
            except Exception:
                df = pd.read_csv(file_path_or_buffer, delimiter=';')
        
        self.raw_df = df
        self.columns = list(df.columns)
        return {
            "columns": self.columns,
            "total_rows": len(df),
            "preview": df.head(10).fillna("").to_dict(orient="records")
        }

    def load_json(self, file_path_or_content):
        """Загрузка журнала событий из формата JSON (массив объектов или трасс)"""
        if isinstance(file_path_or_content, str):
            try:
                data = json.loads(file_path_or_content)
            except Exception:
                with open(file_path_or_content, "r", encoding="utf-8") as f:
                    data = json.load(f)
        else:
            data = json.load(file_path_or_content)

        records = []
        if isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            if "events" in data and isinstance(data["events"], list):
                records = data["events"]
            elif "traces" in data and isinstance(data["traces"], list):
                for tr in data["traces"]:
                    cid = tr.get("case_id") or tr.get("id") or tr.get("name") or "unknown"
                    for ev in tr.get("events", []):
                        item = dict(ev)
                        item["case_id"] = cid
                        records.append(item)
            else:
                for k, v in data.items():
                    if isinstance(v, list):
                        records = v
                        break
                if not records:
                    records = [data]

        df = pd.DataFrame(records)
        self.raw_df = df
        self.columns = list(df.columns)
        return {
            "columns": self.columns,
            "total_rows": len(df),
            "preview": df.head(10).fillna("").to_dict(orient="records")
        }

    def load_xes(self, file_path):
        """Загрузка стандартного лога IEEE 1849-2016 XES"""
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # Разрешение пространств имен XES
        ns = ""
        if root.tag.startswith("{"):
            ns = root.tag.split("}")[0] + "}"

        records = []
        for trace in root.findall(f"{ns}trace"):
            case_id = "unknown"
            for attr in trace:
                if attr.attrib.get("key") in ["concept:name", "case:concept:name", "id"]:
                    case_id = attr.attrib.get("value", case_id)
            
            for event in trace.findall(f"{ns}event"):
                act = "unknown"
                ts = "1970-01-01 00:00:00"
                res = "unknown"
                
                for attr in event:
                    key = attr.attrib.get("key")
                    val = attr.attrib.get("value")
                    if key == "concept:name":
                        act = val
                    elif key == "time:timestamp":
                        ts = val
                    elif key in ["org:resource", "resource"]:
                        res = val

                records.append({
                    "case_id": case_id,
                    "activity": act,
                    "timestamp": ts,
                    "resource": res
                })

        df = pd.DataFrame(records)
        self.raw_df = df
        self.columns = list(df.columns)
        return self.process_traces(case_col="case_id", act_col="activity", time_col="timestamp", res_col="resource")

    def process_traces(self, case_col, act_col, time_col, res_col=None):
        """Группировка событий по трассам и сортировка по времени"""
        if self.raw_df is None or self.raw_df.empty:
            raise ValueError("Данные лога не загружены")

        df = self.raw_df.copy()
        df = df.dropna(subset=[case_col, act_col, time_col])
        
        # Приведение времени к datetime
        df["_parsed_time"] = pd.to_datetime(df[time_col], errors="coerce")
        df = df.dropna(subset=["_parsed_time"])
        df = df.sort_values(by=[case_col, "_parsed_time"])

        self.traces = {}
        self.events_count = len(df)

        for case_id, group in df.groupby(case_col):
            events = []
            for _, row in group.iterrows():
                events.append({
                    "activity": str(row[act_col]),
                    "timestamp": row["_parsed_time"],
                    "resource": str(row[res_col]) if res_col and res_col in row and pd.notna(row[res_col]) else "Не указан"
                })
            
            if events:
                self.traces[str(case_id)] = {
                    "case_id": str(case_id),
                    "events": events,
                    "start_time": events[0]["timestamp"],
                    "end_time": events[-1]["timestamp"],
                    "duration_seconds": (events[-1]["timestamp"] - events[0]["timestamp"]).total_seconds(),
                    "length": len(events)
                }

        durations = [t["duration_seconds"] for t in self.traces.values()]
        median_duration = sorted(durations)[len(durations)//2] if durations else 0

        return {
            "total_cases": len(self.traces),
            "total_events": self.events_count,
            "unique_activities": len(df[act_col].unique()),
            "median_lead_time_seconds": round(median_duration, 1),
            "median_lead_time_formatted": self.format_duration(median_duration)
        }

    def build_dfg(self, node_threshold_pct=0.0, edge_threshold_pct=0.0):
        """
        Реконструкция ориентированного графа прямого следования (DFG).
        node_threshold_pct: отсекать узлы с частотой менее заданного % от максимума.
        edge_threshold_pct: отсекать ребра с весом менее заданного % от максимального ребра.
        """
        if not self.traces:
            raise ValueError("Трассы не сформированы. Выполните маппинг колонок.")

        node_counts = {}
        edge_counts = {}
        edge_durations = {}
        start_nodes = {}
        end_nodes = {}
        rework_loops = 0

        for t in self.traces.values():
            events = t["events"]
            if not events:
                continue

            first_act = events[0]["activity"]
            last_act = events[-1]["activity"]
            start_nodes[first_act] = start_nodes.get(first_act, 0) + 1
            end_nodes[last_act] = end_nodes.get(last_act, 0) + 1

            seen_in_case = set()
            for i, ev in enumerate(events):
                act = ev["activity"]
                node_counts[act] = node_counts.get(act, 0) + 1

                if act in seen_in_case:
                    rework_loops += 1
                seen_in_case.add(act)

                if i < len(events) - 1:
                    next_ev = events[i + 1]
                    next_act = next_ev["activity"]
                    edge_key = (act, next_act)
                    edge_counts[edge_key] = edge_counts.get(edge_key, 0) + 1
                    
                    diff_sec = (next_ev["timestamp"] - ev["timestamp"]).total_seconds()
                    if edge_key not in edge_durations:
                        edge_durations[edge_key] = []
                    edge_durations[edge_key].append(diff_sec)

        if not node_counts:
            return {"graph": {"nodes": [], "edges": [], "metadata": {}}}

        max_node_count = max(node_counts.values())
        max_edge_count = max(edge_counts.values()) if edge_counts else 1

        node_cutoff = (node_threshold_pct / 100.0) * max_node_count
        edge_cutoff = (edge_threshold_pct / 100.0) * max_edge_count

        # Фильтрация узлов
        valid_nodes = set()
        nodes_list = []
        for act, count in node_counts.items():
            if count >= node_cutoff:
                valid_nodes.add(act)
                nodes_list.append({
                    "id": act,
                    "label": act,
                    "count": count,
                    "relative_frequency": round(count / max_node_count, 4),
                    "is_start": start_nodes.get(act, 0) > 0,
                    "start_count": start_nodes.get(act, 0),
                    "is_end": end_nodes.get(act, 0) > 0,
                    "end_count": end_nodes.get(act, 0)
                })

        # Фильтрация ребер
        edges_list = []
        for (src, tgt), weight in edge_counts.items():
            if src in valid_nodes and tgt in valid_nodes:
                if weight >= edge_cutoff:
                    durs = edge_durations.get((src, tgt), [0])
                    avg_dur = sum(durs) / len(durs) if durs else 0
                    median_dur = sorted(durs)[len(durs)//2] if durs else 0

                    is_loop = (src == tgt)
                    reverse_weight = edge_counts.get((tgt, src), 0)
                    if not is_loop and reverse_weight > weight:
                        is_loop = True

                    # Расчет показателя зависимости Heuristic Miner
                    # Formula: (|a > b| - |b > a|) / (|a > b| + |b > a| + 1)
                    if src == tgt:
                        dep_score = round(weight / (weight + 1.0), 3)
                    else:
                        dep_score = round((weight - reverse_weight) / (weight + reverse_weight + 1.0), 3)

                    edges_list.append({
                        "source": src,
                        "target": tgt,
                        "weight": weight,
                        "relative_frequency": round(weight / max_edge_count, 4),
                        "dependency_score": dep_score,
                        "avg_duration_seconds": round(avg_dur, 1),
                        "avg_duration_formatted": self.format_duration(avg_dur),
                        "median_duration_formatted": self.format_duration(median_dur),
                        "is_loop": is_loop
                    })

        # Поиск бутылочных горлышек (топ переходов с наибольшим средним временем ожидания)
        bottlenecks = sorted(
            [e for e in edges_list if e["weight"] > 5],
            key=lambda x: x["avg_duration_seconds"],
            reverse=True
        )[:5]

        metadata = {
            "total_cases": len(self.traces),
            "total_events": self.events_count,
            "visible_nodes": len(nodes_list),
            "visible_edges": len(edges_list),
            "total_unique_activities": len(node_counts),
            "total_unique_transitions": len(edge_counts),
            "node_threshold_pct": node_threshold_pct,
            "edge_threshold_pct": edge_threshold_pct,
            "rework_loops_detected": rework_loops,
            "bottlenecks": bottlenecks
        }

        return {
            "graph": {
                "nodes": nodes_list,
                "edges": edges_list,
                "metadata": metadata
            }
        }

    def export_bpmn(self, graph_data):
        """Экспорт графа DFG в нотацию BPMN 2.0 XML (стандарт ISO/IEC 19510)"""
        nodes = graph_data["graph"]["nodes"]
        edges = graph_data["graph"]["edges"]

        xml_lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
            '                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
            '                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
            '                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"',
            '                  targetNamespace="http://vyatsu.ru/processmining"',
            '                  id="Definitions_Coursework1">',
            '  <bpmn:process id="Reconstructed_Process" name="Реконструированный процесс" isExecutable="false">',
            '    <bpmn:startEvent id="StartEvent_1" name="Старт процесса" />'
        ]

        node_id_map = {}
        for idx, n in enumerate(nodes):
            safe_id = f"Task_{idx+1}"
            node_id_map[n["id"]] = safe_id
            label = self.escape_xml(n["label"])
            xml_lines.append(f'    <bpmn:task id="{safe_id}" name="{label}" />')

        xml_lines.append('    <bpmn:endEvent id="EndEvent_1" name="Завершение процесса" />')

        # Связи со стартом для начальных вершин
        flow_idx = 1
        for n in nodes:
            if n.get("is_start"):
                task_id = node_id_map[n["id"]]
                xml_lines.append(f'    <bpmn:sequenceFlow id="Flow_{flow_idx}" sourceRef="StartEvent_1" targetRef="{task_id}" />')
                flow_idx += 1

        # Прямые переходы DFG
        for e in edges:
            src_id = node_id_map.get(e["source"])
            tgt_id = node_id_map.get(e["target"])
            if src_id and tgt_id:
                xml_lines.append(f'    <bpmn:sequenceFlow id="Flow_{flow_idx}" name="{e["weight"]} раз" sourceRef="{src_id}" targetRef="{tgt_id}" />')
                flow_idx += 1

        # Связи с финишем для конечных вершин
        for n in nodes:
            if n.get("is_end"):
                task_id = node_id_map[n["id"]]
                xml_lines.append(f'    <bpmn:sequenceFlow id="Flow_{flow_idx}" sourceRef="{task_id}" targetRef="EndEvent_1" />')
                flow_idx += 1

        xml_lines.append('  </bpmn:process>')
        xml_lines.append('</bpmn:definitions>')

        return "\n".join(xml_lines)

    @staticmethod
    def format_duration(seconds):
        if seconds < 60:
            return f"{round(seconds, 1)} сек"
        elif seconds < 3600:
            return f"{round(seconds / 60, 1)} мин"
        elif seconds < 86400:
            return f"{round(seconds / 3600, 1)} ч"
        else:
            days = round(seconds / 86400, 1)
            return f"{days} дн"

    @staticmethod
    def escape_xml(text):
        return (str(text)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;"))
