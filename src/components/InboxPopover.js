/**
 * @file InboxPopover.js
 * @description Composant React.
 */

import { Popover, OverlayTrigger, Button, Badge, ListGroup } from 'react-bootstrap';
import './InboxPopover.css';

// Données de simulation pour les messages
const messages = [
    {
        id: 1,
        name: 'David',
        text: 'Hey, how are you?',
        time: 'just now',
        color: 'success', // green
        avatarUrl: 'https://i.pravatar.cc/150?img=1'
    },
    {
        id: 2,
        name: 'John',
        text: 'I am waiting for you...',
        time: '5 mins ago',
        color: 'primary', // blue
        avatarUrl: 'https://i.pravatar.cc/150?img=2'
    },
    {
        id: 3,
        name: 'Clara',
        text: 'Where are you?',
        time: '1 hour ago',
        color: 'danger', // pink/red
        avatarUrl: 'https://i.pravatar.cc/150?img=3'
    },
    {
        id: 4,
        name: 'Lana',
        text: 'See you tomorrow',
        time: '2 hours ago',
        color: 'warning', // yellow
        avatarUrl: 'https://i.pravatar.cc/150?img=4'
    }
];

const InboxPopover = () => {

    const popover = (
        <Popover id="popover-inbox" className="inbox-popover shadow-lg rounded-xl">
            <Popover.Header as="h3" className="d-flex justify-content-between align-items-center">
                <span className="fw-bold">Inbox</span>
                <Badge bg="warning" text="dark" pill>3 new</Badge>
            </Popover.Header>
            <Popover.Body className="p-0">
                <ListGroup variant="flush">
                    {messages.map(message => (
                        <ListGroup.Item key={message.id} action className="d-flex align-items-center p-3">
                            <div className="position-relative me-3">
                                <img src={message.avatarUrl} alt={message.name} className="rounded-circle" style={{ width: '40px', height: '40px' }} />
                                <span className={`position-absolute bottom-0 end-0 p-1 bg-${message.color} border border-light rounded-circle`}>
                                    <span className="visually-hidden">Online</span>
                                </span>
                            </div>
                            <div className="flex-grow-1">
                                <div className="d-flex justify-content-between">
                                    <p className="fw-bold mb-0">{message.name}</p>
                                    <small className="text-muted">{message.time}</small>
                                </div>
                                <p className="text-muted mb-0 text-truncate" style={{ maxWidth: '200px' }}>{message.text}</p>
                            </div>
                        </ListGroup.Item>
                    ))}
                </ListGroup>
            </Popover.Body>
            <div className="p-3 border-top">
                <Button variant="outline-primary" className="w-100 rounded-pill">
                    See All Messages
                </Button>
            </div>
        </Popover>
    );

    return (
        <OverlayTrigger trigger="click" placement="bottom-end" overlay={popover} rootClose>
            <Button variant="link" className="nav-link text-body-secondary position-relative">
                <iconify-icon icon="solar:chat-round-dots-bold-duotone" style={{ fontSize: '24px' }}></iconify-icon>
                <Badge pill bg="warning" text="dark" className="position-absolute top-0 start-100 translate-middle border border-light" style={{ fontSize: '0.6em', padding: '0.3em 0.5em' }}>
                    3
                </Badge>
            </Button>
        </OverlayTrigger>
    );
};

export default InboxPopover;