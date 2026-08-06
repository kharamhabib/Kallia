package signaling

import (
	"kallia/internal/voip/core"
	"kallia/internal/voip/wanode"

	waBinary "go.mau.fi/whatsmeow/binary"
)

type NodeInfo struct {
	Tag            string
	PeerJid        string
	CallID         string
	PeerPlatform   string
	PeerAppVersion string
	EpochID        string
	Timestamp      string
	InnerNode      *waBinary.Node
}

var signalingTags = map[string]bool{
	"offer":       true,
	"accept":      true,
	"terminate":   true,
	"reject":      true,
	"preaccept":   true,
	"transport":   true,
	"interim":     true,
	"fieldstatus": true,
}

func ExtractNodeInfo(node *waBinary.Node) *NodeInfo {
	if node == nil {
		return nil
	}
	children := wanode.NodeChildren(node)
	if len(children) == 0 {
		callID := wanode.AttrString(node.Attrs, "call-id")
		if callID != "" {
			return &NodeInfo{
				Tag:            node.Tag,
				PeerJid:        wanode.AttrString(node.Attrs, "from"),
				CallID:         callID,
				PeerPlatform:   wanode.AttrString(node.Attrs, "platform"),
				PeerAppVersion: wanode.AttrString(node.Attrs, "version"),
				InnerNode:      node,
			}
		}
		return nil
	}

	// 1. Procura primeiro por uma tag de sinalização principal (offer, accept, terminate, reject, transport, preaccept)
	var target *waBinary.Node
	for i := range children {
		if signalingTags[children[i].Tag] {
			target = &children[i]
			break
		}
	}

	// 2. Se não achou tag conhecida, procura por um filho que possua o atributo "call-id"
	if target == nil {
		for i := range children {
			if wanode.AttrString(children[i].Attrs, "call-id") != "" {
				target = &children[i]
				break
			}
		}
	}

	// 3. Fallback: pega o primeiro filho
	if target == nil {
		target = &children[0]
	}

	// Tenta extrair call-id da tag escolhida, da raiz ou de qualquer outro filho
	callID := wanode.AttrString(target.Attrs, "call-id")
	if callID == "" {
		callID = wanode.AttrString(node.Attrs, "call-id")
	}
	if callID == "" {
		for i := range children {
			if cid := wanode.AttrString(children[i].Attrs, "call-id"); cid != "" {
				callID = cid
				break
			}
		}
	}

	return &NodeInfo{
		Tag:            target.Tag,
		PeerJid:        wanode.AttrString(node.Attrs, "from"),
		CallID:         callID,
		PeerPlatform:   wanode.AttrString(node.Attrs, "platform"),
		PeerAppVersion: wanode.AttrString(node.Attrs, "version"),
		EpochID:        wanode.AttrString(target.Attrs, "e"),
		Timestamp:      wanode.AttrString(target.Attrs, "t"),
		InnerNode:      target,
	}
}

func ExtractRelayEndpoints(node *waBinary.Node) []core.RelayEndpoint {
	var relays []core.RelayEndpoint

	parseRelay := func(n *waBinary.Node) {
		ip := wanode.AttrString(n.Attrs, "ip")
		token := wanode.AttrString(n.Attrs, "token")
		if ip == "" || token == "" {
			return
		}
		key := wanode.AttrString(n.Attrs, "relay-key")
		if key == "" {
			key = wanode.AttrString(n.Attrs, "key")
		}
		ep := core.RelayEndpoint{
			IP:      ip,
			Port:    wanode.AttrInt(n.Attrs, "port", core.WARelayPort),
			Token:   token,
			Key:     key,
			RelayID: wanode.AttrInt(n.Attrs, "relay-id", 0),
		}
		if wanode.HasAttr(n.Attrs, "c2r-rtt") {
			v := wanode.AttrInt(n.Attrs, "c2r-rtt", 0)
			ep.C2RRtt = &v
		}
		relays = append(relays, ep)
	}

	for _, child := range wanode.NodeChildren(node) {
		child := child
		switch child.Tag {
		case "relay":
			parseRelay(&child)
		case "relays":
			for _, rn := range wanode.NodeChildren(&child) {
				rn := rn
				if rn.Tag == "relay" {
					parseRelay(&rn)
				}
			}
		}
	}

	sortRelaysByRtt(relays)
	return relays
}

func findEncNode(inner *waBinary.Node) *waBinary.Node {
	for _, c := range wanode.NodeChildren(inner) {
		c := c
		if c.Tag == "enc" && wanode.HasAttr(c.Attrs, "type") {
			return &c
		}
	}
	for _, c := range wanode.NodeChildren(inner) {
		if c.Tag != "destination" {
			continue
		}
		for _, toNode := range wanode.NodeChildren(&c) {
			if toNode.Tag != "to" {
				continue
			}
			for _, e := range wanode.NodeChildren(&toNode) {
				e := e
				if e.Tag == "enc" && wanode.HasAttr(e.Attrs, "type") {
					return &e
				}
			}
		}
	}
	return nil
}
